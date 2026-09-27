// Storage key for localStorage
const STORAGE_KEY = 'preprereg_saved_routine';

// Convert "14:00:00" -> "2:00 pm"
function formatTime12(time24) {
    if (!time24) return '';
    let [h, m] = time24.split(':');
    let hour = parseInt(h, 10);
    let meridian = hour >= 12 ? 'pm' : 'am';
    if (hour > 12) hour -= 12;
    else if (hour === 0) hour = 12;
    return `${hour}:${m} ${meridian}`;
}

// "2026-07-25" -> "SATURDAY"
function getWeekdayName(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
}

// "2026-07-25" -> "25-07-2026"
function formatDateDMY(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
}

// Renders one type's rows (already date-sorted) into a column as
// day-grouped cards. Shows a small empty note if there are none.
function renderExamColumn(containerEl, rows, typeClass) {
    containerEl.innerHTML = '';

    if (rows.length === 0) {
        containerEl.innerHTML = '<p class="exam-column-empty">No exams scheduled</p>';
        return;
    }

    let i = 0;
    while (i < rows.length) {
        let j = i;
        while (j + 1 < rows.length && rows[j + 1].date === rows[i].date) {
            j++;
        }

        const card = document.createElement('div');
        card.classList.add('exam-day-card', typeClass);

        const header = document.createElement('div');
        header.classList.add('exam-day-header');
        header.innerHTML = `
            <span class="exam-day-weekday">${getWeekdayName(rows[i].date)}</span>
            <span class="exam-day-date">${formatDateDMY(rows[i].date)}</span>
        `;
        card.appendChild(header);

        for (let k = i; k <= j; k++) {
            const row = rows[k];
            const entry = document.createElement('div');
            entry.classList.add('exam-entry');
            entry.innerHTML = `
                <span class="exam-course-badge">${row.course}</span>
                <span class="exam-time">${formatTime12(row.start)} - ${formatTime12(row.end)}</span>
            `;
            card.appendChild(entry);
        }

        containerEl.appendChild(card);
        i = j + 1;
    }
}

// Rebuilds the Exam Schedule from the currently selected courses.
// MID exams render in the left column, FINAL exams in the right column,
// each as day-grouped cards (course badge + time range).
// selectedElements: dlb.selected (array of <li> elements with data-id)
function renderExamSchedule(selectedElements, data) {
    const columns = document.getElementById('examScheduleColumns');
    const midList = document.getElementById('examScheduleMidList');
    const finalList = document.getElementById('examScheduleFinalList');
    const emptyMsg = document.getElementById('examScheduleEmpty');
    if (!columns || !midList || !finalList) return;

    let rows = [];
    selectedElements.forEach(elem => {
        const dataIndex = elem.getAttribute('data-id');
        const course_desc = data[dataIndex - 1]['desc'];
        const sched = course_desc && course_desc.sectionSchedule;
        if (!sched) return;

        if (sched.midExamDate) {
            rows.push({
                date: sched.midExamDate,
                start: sched.midExamStartTime,
                end: sched.midExamEndTime,
                type: 'MID',
                course: course_desc.courseCode
            });
        }
        if (sched.finalExamDate) {
            rows.push({
                date: sched.finalExamDate,
                start: sched.finalExamStartTime,
                end: sched.finalExamEndTime,
                type: 'FINAL',
                course: course_desc.courseCode
            });
        }
    });

    // sort chronologically by date, then start time
    rows.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.start || '').localeCompare(b.start || '');
    });

    if (rows.length === 0) {
        columns.style.display = 'none';
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }

    columns.style.display = 'flex';
    if (emptyMsg) emptyMsg.style.display = 'none';

    const midRows = rows.filter(r => r.type === 'MID');
    const finalRows = rows.filter(r => r.type === 'FINAL');

    renderExamColumn(midList, midRows, 'mid');
    renderExamColumn(finalList, finalRows, 'final');
}

// Save selected section IDs to localStorage
function saveRoutine(selectedCourses, data) {
    const sectionIds = selectedCourses
        .map(item => {
            const dataId = Number(item.getAttribute('data-id'));
            const course = data[dataId - 1]?.desc;
            return course?.sectionId;
        })
        .filter(sectionId => sectionId !== undefined && sectionId !== null);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sectionIds));
}

// Load saved routine from localStorage
function loadRoutine() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
}

async function start() {
    
    // poking the schedules route for the json data
    const res = await fetch('https://usis-cdn.eniamza.com/connect-migrate.json');
    const scheduleData = await res.json();
    const schedule = scheduleData.courses;

    const lastUpdatedElement = document.getElementById('last_updated');
    if (scheduleData.metadata.lastUpdated) {
        const lastUpdatedDate = new Date(scheduleData.metadata.lastUpdated);
        lastUpdatedElement.textContent = lastUpdatedDate.toLocaleString();
    } else {
        lastUpdatedElement.textContent = 'Unknown';
    }

    schedule.sort(function(a, b) {
        let courseA = `${a.courseCode}-${a.sectionName}`;
        let courseB = `${b.courseCode}-${b.sectionName}`;
        return courseA.localeCompare(courseB);
    });

    const data = [];
    let course_and_exam = [];

    // regex defined for filtering out the day, time and room from the string
    let re = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\(\d{1,2}:\d{2}\s(AM|PM)-\d{1,2}:\d{2}\s(AM|PM)(-[^\)]+)?\)(\\n(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\(\d{1,2}:\d{2}\s(AM|PM)-\d{1,2}:\d{2}\s(AM|PM)(-[^\)]+)?\))*/gi;

    // making the data for passing in the dlb (dual list box)
    for (let i = 1; i < schedule.length; i++) {
        let matches = schedule[i]["preRegSchedule"] ? schedule[i]["preRegSchedule"].match(re) : null;
        schedule[i]["preRegSchedule"] = matches ? matches : [];

        if (schedule[i]["preRegLabSchedule"]) {
            let labMatches = schedule[i]["preRegLabSchedule"].match(re);
            if (labMatches) {
                schedule[i]["preRegSchedule"].push(...labMatches);
            }
        }

        data.push({
            value: i,
            text: `${schedule[i]['courseCode']}: sec-${schedule[i]['sectionName']}`,
            desc: schedule[i]
        });
    }

    let total_credit = 0;
    let isLoadingRoutine = false; // Flag to bypass credit check during load

    let dlb = new DualListbox('.dlb', {

        addEvent: function (value) {
            const newCourseCredit = data[value - 1]['desc']['courseCredit'];
            
            // Skip credit check if we're loading from localStorage
            if (!isLoadingRoutine && total_credit + newCourseCredit > 15) {
                this.removeSelected(document.querySelector(`[data-id="${value}"]`));
                document.querySelector('.warning').innerHTML = "You cannot select more than 15 Credits";
                return;
            }

            let flag = true;
            let data_index;
            let course_desc;
            
            // Check for duplicate course
            for (let i = 0; i < this.selected.length - 1; i++) {
                if (this.selected[i].innerHTML.split(':')[0] == data[value - 1]['desc']["courseCode"]) {
                    this.removeSelected(document.querySelector(`[data-id="${value}"]`));
                    document.querySelector('.warning').innerHTML = "You can not select same course";
                    flag = false;
                    break;
                }
            }
            
            if (flag) {
                document.querySelector('.warning').innerHTML = "";
                blanking_table();
                
                // Reset and recalculate total credit from all selected courses
                total_credit = 0;
                for (let i = 0; i < this.selected.length; i++) {
                    data_index = this.selected[i].getAttribute("data-id");
                    course_desc = data[data_index - 1]['desc'];
                    push_to_table(course_desc);
                    total_credit += course_desc['courseCredit'];
                }
                
                // Update the display immediately
                document.getElementById("total_credit").innerHTML = total_credit;

                course_desc = data[value - 1]['desc'];
                course_and_exam.push({ 
                    'courseCode': course_desc.courseCode, 
                    'date': course_desc?.sectionSchedule?.finalExamDate || 'N/A',
                    'time': course_desc?.sectionSchedule?.finalExamStartTime || 'N/A'
                });
                populateExamWarning(findDuplicateExamDays(course_and_exam));
                info_populator("right", course_desc);
                info_unpopulator("left");
                renderExamSchedule(this.selected, data);
                
                // Auto-save after adding (skip during initial load)
                if (!isLoadingRoutine) {
                    saveRoutine(this.selected, data);
                }
            }
        },

        removeEvent: function (value) {
            let flag = true;
            let data_index;
            let course_desc;
            for (let i = 0; i < this.selected.length; i++) {
                for (let j = i + 1; j < this.selected.length; j++) {
                    if (this.selected[i].innerHTML.split(':')[0] == this.selected[j].innerHTML.split(':')[0]) {
                        flag = false;
                    }
                }
            }
            if (flag) {
                document.querySelector('.warning').innerHTML = "";
                blanking_table();
                total_credit = 0;
                for (let i = 0; i < this.selected.length; i++) {
                    data_index = this.selected[i].getAttribute("data-id");
                    push_to_table(data[data_index - 1]['desc']);
                    course_desc = data[data_index - 1]['desc'];
                    total_credit += course_desc['courseCredit'];
                }
                document.getElementById("total_credit").innerHTML = total_credit;
                course_desc = data[value - 1]['desc'];
                course_and_exam = course_and_exam.filter(course => course.courseCode !== course_desc.courseCode);
                populateExamWarning(findDuplicateExamDays(course_and_exam));
                info_populator("left", course_desc);
                if (this.selected.length != 0) {
                    data_index = this.selected[this.selected.length - 1].getAttribute("data-id");
                    course_desc = data[data_index - 1]['desc'];
                    info_populator("right", course_desc);
                } else {
                    info_unpopulator("right");
                }
                renderExamSchedule(this.selected, data);
                
                // Auto-save after removing
                saveRoutine(this.selected, data);
            }
        },

        availableTitle: "Available Courses",
        selectedTitle: "Selected Courses",
        addButtonText: ">",
        removeButtonText: "<",
        removeAllButtonText: "<<",
        showAddAllButton: false,
        options: data
    });

    // Load saved routine on startup
    const savedSectionIds = loadRoutine();
    if (savedSectionIds.length > 0) {
        isLoadingRoutine = true; // Set flag to bypass credit check
        savedSectionIds.forEach(sectionId => {
            const matchedOption = data.find(option => option.desc?.sectionId === sectionId);
            const item = matchedOption
                ? document.querySelector(`[data-id="${matchedOption.value}"]`)
                : null;

            if (item && dlb.available.includes(item)) {
                dlb.addSelected(item);
            }
        });
        isLoadingRoutine = false; // Reset flag after loading
        
        // Save the routine again to clean up any invalid IDs
        saveRoutine(dlb.selected, data);
        renderExamSchedule(dlb.selected, data);
    }

    // Click event handler
    dlb.addEventListener('click', (event) => {
        if (event.target.closest(".dual-listbox__available") && event.target.classList.contains("dual-listbox__item") && event.target.classList.contains("dual-listbox__item--selected")) {
            document.querySelector('.warning').innerHTML = "";
            let value = event.target.getAttribute('data-id');
            let course_desc = data[value - 1]["desc"];
            info_populator("left", course_desc);
        }
        if (event.target.closest(".dual-listbox__selected") && event.target.classList.contains("dual-listbox__item") && event.target.classList.contains("dual-listbox__item--selected")) {
            document.querySelector('.warning').innerHTML = "";
            let value = event.target.getAttribute('data-id');
            let course_desc = data[value - 1]["desc"];
            info_populator("right", course_desc);
        }
    });

	dlb.addEventListener('added', (event) => {
		refreshClashLint(data)
	})
	
	dlb.addEventListener('removed', (event) => {
		refreshClashLint(data)
	})
}

function info_populator(side, course_desc) {
    document.querySelector(`.${side} #cname`).innerHTML = course_desc["courseCode"];
    document.querySelector(`.${side} #ctitle`).innerHTML = course_desc["courseName"];
    document.querySelector(`.${side} #faculty`).innerHTML = `${course_desc["faculties"]}`;
    document.querySelector(`.${side} #section`).innerHTML = course_desc['sectionName'];
    document.querySelector(`.${side} #time`).innerHTML = course_desc["preRegSchedule"];
    document.querySelector(`.${side} #exam`).innerHTML = course_desc?.sectionSchedule?.finalExamDetail || 'N/A';
    document.querySelector(`.${side} #avs`).innerHTML = course_desc["capacity"];
    document.querySelector(`.${side} #sb`).innerHTML = course_desc["consumedSeat"];
    document.querySelector(`.${side} #sr`).innerHTML = course_desc["capacity"] - course_desc["consumedSeat"];
}

function info_unpopulator(side) {
    document.querySelector(`.${side} #cname`).innerHTML = "";
    document.querySelector(`.${side} #ctitle`).innerHTML = "";
    document.querySelector(`.${side} #faculty`).innerHTML = "";
    document.querySelector(`.${side} #section`).innerHTML = "";
    document.querySelector(`.${side} #time`).innerHTML = "";
    document.querySelector(`.${side} #exam`).innerHTML = "";
    document.querySelector(`.${side} #avs`).innerHTML = "";
    document.querySelector(`.${side} #sb`).innerHTML = "";
    document.querySelector(`.${side} #sr`).innerHTML = "";
}

function findDuplicateExamDays(courses) {
    const dayMap = {};
    const timeMap = {};
    const dateDuplicates = [];
    const timeDuplicates = [];

    courses.forEach(course => {
        if (!dayMap[course.date]) {
            dayMap[course.date] = [course.courseCode];
        } else {
            if (!dayMap[course.date].includes(course.courseCode)) {
                dayMap[course.date].push(course.courseCode);
            }
            if (dayMap[course.date].length > 1 && !dateDuplicates.some(d => d.date === course.date)) {
                dateDuplicates.push({ 
                    date: course.date, 
                    courseCodes: dayMap[course.date] 
                });
            }
        }

        const dateTimeKey = `${course.date} ${course.time}`;
        if (!timeMap[dateTimeKey]) {
            timeMap[dateTimeKey] = [course.courseCode];
        } else {
            if (!timeMap[dateTimeKey].includes(course.courseCode)) {
                timeMap[dateTimeKey].push(course.courseCode);
            }
            if (timeMap[dateTimeKey].length > 1 && !timeDuplicates.some(d => d.dateTime === dateTimeKey)) {
                timeDuplicates.push({ 
                    dateTime: dateTimeKey, 
                    courseCodes: timeMap[dateTimeKey] 
                });
            }
        }
    });

    return { dateDuplicates, timeDuplicates };
}

function populateExamWarning(duplicateDays) {
    const examWarningElement = document.querySelector('.examWarning');
    const { dateDuplicates, timeDuplicates } = duplicateDays;

    let html = '';

    if (dateDuplicates.length > 0) {
        html += '<strong>Date Clashes:</strong><br>';
        html += dateDuplicates.map(day => `${day.courseCodes.join(', ')} exam clashes on ${day.date}<br>`).join('');
    }

    if (timeDuplicates.length > 0) {
        html += '<strong>Time Clashes:</strong><br>';
        html += timeDuplicates.map(day => `${day.courseCodes.join(', ')} exam clashes on ${day.dateTime}<br>`).join('');
    }

    examWarningElement.innerHTML = html;
}

function refreshClashLint(data) {
	// From the available coureses lints those that would clash class or lab timings
	let hash = BigInt(getTableHash())
	document.querySelector('.dual-listbox__available').childNodes.forEach((elem) => {
		let i = elem.getAttribute('data-id') - 1;
		if (BigInt(getScheduleHash(data[i]['desc'])) & hash) {
			elem.classList.add('clashLint')
		} else {
			elem.classList.remove('clashLint')
		}
	})
	
	document.querySelector('.dual-listbox__selected').childNodes.forEach((elem) => {
	    elem.classList.remove('clashLint')
	})
}
	
start();