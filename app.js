// app.js
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getDatabase,
    ref, 
    set, 
    push,
    get,
    onValue,
    remove    // Add this import
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// Initialize Firebase
console.log('Initializing Firebase...');
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

let selectedDates = [];

// Add these variables at the top level after database initialization
let currentEditingTribeId = null;

// Event handler functions
function addDate() {
    const startDate = document.getElementById('dateInput').value;
    const eventType = document.querySelector('input[name="eventType"]:checked').value;
    const endDate = document.getElementById('endDateInput').value;
    
    if (startDate) {
        const startDateTime = new Date(startDate + 'T00:00:00');
        let dateRange;

        if (eventType === 'specific') {
            dateRange = {
                start: startDate,
                end: startDate  // Same date for specific dates
            };
        } else {
            if (!endDate) {
                alert('Please select an end date for date range');
                return;
            }
            const endDateTime = new Date(endDate + 'T00:00:00');
            if (endDateTime < startDateTime) {
                alert('End date must be after start date');
                return;
            }
            dateRange = {
                start: startDate,
                end: endDate
            };
        }
        
        const rangeString = `${dateRange.start}|${dateRange.end}`;
        if (!selectedDates.some(d => `${d.start}|${d.end}` === rangeString)) {
            selectedDates.push(dateRange);
            renderDates();
            document.getElementById('dateInput').value = '';
            document.getElementById('endDateInput').value = '';
        }
    }
}

// Attach functions to window object
window.addDate = addDate;
window.removeDate = function(startDate, endDate) {
    selectedDates = selectedDates.filter(d => !(d.start === startDate && d.end === endDate));
    renderDates();
};

// Remove this old function
// window.copyLink = function() {
//     const linkInput = document.getElementById('shareLinkInput');
//     linkInput.select();
//     document.execCommand('copy');
// };

// Add this utility function
function getVoteUrl(eventId) {
    return `${window.location.origin}/vote.html?event=${eventId}`;
}

// Replace the existing copyEventLink function
window.copyEventLink = async function(eventId) {
    try {
        let linkText;
        if (eventId) {
            // Called from event report
            const linkElements = document.querySelectorAll(`.event-link[data-event-id="${eventId}"]`);
            if (linkElements.length > 0) {
                linkText = linkElements[0].value;
            }
        } else {
            // Called from create event view
            const shareLinkInput = document.getElementById('shareLinkInput');
            if (shareLinkInput) {
                linkText = shareLinkInput.value;
            }
        }

        if (!linkText) {
            throw new Error('Could not find link to copy');
        }

        await navigator.clipboard.writeText(linkText);
        alert('Link copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy link. Please copy it manually.');
    }
};

// Add delete event function
window.deleteEvent = async function(eventId) {
    if (confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
        try {
            const eventRef = ref(database, `events/${eventId}`);
            await remove(eventRef);
            alert('Event deleted successfully');
        } catch (error) {
            console.error("Error deleting event:", error);
            alert("Error deleting event. Please try again.");
        }
    }
};

// Update formatDateForDisplay to preserve local date
function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        timeZone: 'UTC'  // Use UTC to prevent timezone conversion
    });
}

// Add this new function to handle adding days of week
window.addDaysOfWeek = function() {
    const checkboxes = document.querySelectorAll('input[name="daysOfWeek"]:checked');
    if (checkboxes.length === 0) {
        alert('Please select at least one day of the week');
        return;
    }

    const selectedDays = Array.from(checkboxes).map(cb => cb.value);
    const dateRange = {
        type: 'dayOfWeek',
        days: selectedDays
    };

    // Remove any existing day of week entries
    selectedDates = selectedDates.filter(d => !d.type || d.type !== 'dayOfWeek');
    selectedDates.push(dateRange);
    renderDates();

    // Uncheck all checkboxes
    document.querySelectorAll('input[name="daysOfWeek"]').forEach(cb => cb.checked = false);
};

function renderDates() {
    const datesList = document.getElementById('datesList');
    datesList.innerHTML = selectedDates.map(dateRange => {
        if (dateRange.type === 'dayOfWeek') {
            return `
                <div class="date-tag">
                    Days of Week: ${dateRange.days.join(', ')}
                    <button onclick="removeDate('dayOfWeek')">&times;</button>
                </div>
            `;
        }
        const isSpecificDate = dateRange.start === dateRange.end;
        const displayText = isSpecificDate ? 
            formatDateForDisplay(dateRange.start) :
            `${formatDateForDisplay(dateRange.start)} to ${formatDateForDisplay(dateRange.end)}`;
            
        return `
            <div class="date-tag">
                ${displayText}
                <button onclick="removeDate('${dateRange.start}', '${dateRange.end}')">&times;</button>
            </div>
        `;
    }).join('');
}

async function createEvent(e) {
    e.preventDefault();
    
    const tribeId = document.getElementById('tribeSelect').value;
    if (!tribeId) {
        alert('Please select a tribe for this event');
        return;
    }

    const eventData = {
        title: document.getElementById('eventTitle').value,
        description: document.getElementById('eventDescription').value,
        type: document.querySelector('input[name="eventType"]:checked').value,
        dates: selectedDates.map(dateRange => {
            if (dateRange.type === 'dayOfWeek') {
                return {
                    type: 'dayOfWeek',
                    days: dateRange.days,
                    displayRange: `Days: ${dateRange.days.join(', ')}`
                };
            }
            return {
                start: dateRange.start,
                end: dateRange.end,
                displayRange: `${formatDateForDisplay(dateRange.start)} to ${formatDateForDisplay(dateRange.end)}`
            };
        }),
        createdBy: 'anonymous',
        participants: {},
        created: new Date().toISOString(),
        tribeId: document.getElementById('tribeSelect').value
    };

    try {
        const eventsRef = ref(database, 'events');
        const newEventRef = push(eventsRef);
        await set(newEventRef, eventData);
        
        // Generate and display the vote URL
        const voteUrl = `${window.location.origin}/vote.html?event=${newEventRef.key}`;
        const shareLinkInput = document.getElementById('shareLinkInput');
        shareLinkInput.value = voteUrl;
        document.getElementById('shareLink').style.display = 'block';
        
        // Clear the form
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDescription').value = '';
        document.getElementById('dateInput').value = '';
        document.getElementById('endDateInput').value = '';
        selectedDates = [];
        renderDates();
        
        console.log('Event created successfully:', newEventRef.key);
    } catch (error) {
        console.error("Error creating event: ", error);
        alert("Error creating event. Please try again.");
    }
};

function renderEventReport(eventId, eventData) {
    const votes = eventData.participants || {};
    const dateRanges = eventData.dates || [];
    const voteUrl = getVoteUrl(eventId);
    
    // Calculate totals for each date range
    const totals = dateRanges.map((_, index) => {
        const yesVotes = Object.values(votes).filter(p => p.votes?.[index] === 2).length;
        const noVotes = Object.values(votes).filter(p => p.votes?.[index] === 0).length;
        return { yes: yesVotes, no: noVotes };
    });
    
    return `
        <div class="event-report">
            <div class="event-header">
                <div class="event-title-section">
                    <h3>${eventData.title}
                        <button class="edit-icon" onclick="window.editEventField('${eventId}', 'title', '${eventData.title}')">
                            ✏️
                        </button>
                    </h3>
                </div>
                <button class="delete-event-btn" onclick="deleteEvent('${eventId}')">Delete Event</button>
            </div>
            <div class="description-container">
                <p class="event-description">${eventData.description || 'No description'}</p>
                <button class="edit-icon" onclick="window.editEventField('${eventId}', 'description', '${eventData.description || ''}')">
                    ✏️
                </button>
            </div>

            <div class="event-link-container">
                <input class="event-link" type="text" readonly value="${voteUrl}" data-event-id="${eventId}">
                <button class="copy-button" onclick="copyEventLink('${eventId}')">Copy Link</button>
                <button class="go-button" onclick="openEventLink('${eventId}')">Go</button>
            </div>

            <div class="votes-summary">
                <h4>Summary</h4>
                <table class="report-table">
                    <tr>
                        <th>${eventData.type === 'dayOfWeek' ? 'Day' : 
                             dateRanges[0]?.start === dateRanges[0]?.end ? 'Date' : 'Date Range'}</th>
                        <th>Yes</th>
                        <th>No</th>
                    </tr>
                    ${dateRanges.map((range, i) => {
                        const total = totals[i] || { yes: 0, no: 0 };
                        if (range.type === 'dayOfWeek') {
                            return range.days.map(day => `
                                <tr>
                                    <td>${day}</td>
                                    <td>${total.yes}</td>
                                    <td>${total.no}</td>
                                </tr>
                            `).join('');
                        }
                        const isSpecificDate = range.start === range.end;
                        const displayDate = isSpecificDate ? 
                            formatDateForDisplay(range.start) :
                            `${formatDateForDisplay(range.start)} to ${formatDateForDisplay(range.end)}`;
                        return `
                            <tr>
                                <td>${displayDate}</td>
                                <td>${total.yes}</td>
                                <td>${total.no}</td>
                            </tr>
                        `;
                    }).join('')}
                </table>
            </div>

            <div class="individual-votes">
                <h4>Individual Responses</h4>
                <table class="report-table">
                    <tr>
                        <th>Name</th>
                        ${dateRanges.map(range => {
                            const isSpecificDate = range.start === range.end;
                            const displayDate = isSpecificDate ? 
                                formatDateForDisplay(range.start) :
                                `${formatDateForDisplay(range.start)} to ${formatDateForDisplay(range.end)}`;
                            return `<th>${displayDate}</th>`;
                        }).join('')}
                    </tr>
                    ${Object.entries(votes).map(([name, data]) => `
                        <tr>
                            <td>${name}</td>
                            ${data.votes.map(vote => `
                                <td>
                                    <span class="${vote === 2 ? 'vote-yes' : 'vote-no'}">
                                        ${vote === 2 ? '✓' : '✗'}
                                    </span>
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </table>
            </div>
        </div>
    `;
}

// Add this new function
window.editEventField = async function(eventId, field, currentValue) {
    let newValue = prompt(`Edit event ${field}:`, currentValue);
    
    if (newValue !== null && newValue !== currentValue) {
        try {
            const updates = {};
            updates[field] = newValue;
            
            const eventRef = ref(database, `events/${eventId}`);
            await set(eventRef, {
                ...(await get(eventRef)).val(),
                ...updates
            });
        } catch (error) {
            console.error(`Error updating event ${field}:`, error);
            alert(`Error updating event ${field}`);
        }
    }
};

// Change function name from loadEventReports to loadEvents
async function loadEvents() {
    const eventsRef = ref(database, 'events');
    onValue(eventsRef, (snapshot) => {
        const events = snapshot.val() || {};
        const eventsHtml = Object.entries(events)
            .map(([eventId, eventData]) => renderEventReport(eventId, eventData))
            .join('');
        document.getElementById('eventsList').innerHTML = eventsHtml;
    });
}

// Add this function to handle radio button changes
function handleEventTypeChange() {
    const eventType = document.querySelector('input[name="eventType"]:checked').value;
    const endDateField = document.querySelector('.range-date');
    const dateInput = document.querySelector('.date-input');
    const dayOfWeekSelector = document.getElementById('dayOfWeekSelector');
    
    endDateField.style.display = 'none';
    dateInput.style.display = 'block';
    dayOfWeekSelector.style.display = 'none';
    
    switch(eventType) {
        case 'specific':
            document.getElementById('addDateBtn').textContent = 'Add Date';
            break;
        case 'range':
            endDateField.style.display = 'block';
            document.getElementById('addDateBtn').textContent = 'Add Date Range';
            break;
        case 'dayOfWeek':
            dateInput.style.display = 'none';
            dayOfWeekSelector.style.display = 'block';
            break;
    }
}

// Add tribe management functions
async function addPerson(e) {
    e.preventDefault();
    const fullName = document.getElementById('personName').value.trim();
    
    if (fullName) {
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ');
        
        if (!lastName) {
            alert('Please enter both first and last name');
            return;
        }
        
        try {
            const peopleRef = ref(database, 'people');
            const newPersonRef = push(peopleRef);
            await set(newPersonRef, {
                firstName,
                lastName,
                created: new Date().toISOString()
            });
            
            document.getElementById('personName').value = '';
        } catch (error) {
            console.error("Error adding person:", error);
            alert("Error adding person");
        }
    }
}

// Modify the createTribe function to handle both create and edit
async function createTribe(e) {
    e.preventDefault();
    const tribeName = document.getElementById('tribeName').value.trim();
    const selectedMembers = Array.from(document.querySelectorAll('#memberCheckboxes input:checked'))
        .map(checkbox => checkbox.value);
    
    if (selectedMembers.length === 0) {
        alert('Please select at least one member');
        return;
    }
    
    try {
        const tribesRef = ref(database, currentEditingTribeId ? 
            `tribes/${currentEditingTribeId}` : 
            'tribes');

        const tribeData = {
            name: tribeName,
            members: selectedMembers,
            updated: new Date().toISOString()
        };

        // Only add created date for new tribes
        if (!currentEditingTribeId) {
            tribeData.created = new Date().toISOString();
        }

        if (currentEditingTribeId) {
            await set(tribesRef, tribeData);
        } else {
            const newTribeRef = push(tribesRef);
            await set(newTribeRef, tribeData);
        }
        
        resetTribeForm();
    } catch (error) {
        console.error("Error saving tribe:", error);
        alert("Error saving tribe");
    }
}

function resetTribeForm() {
    document.getElementById('tribeName').value = '';
    document.querySelectorAll('#memberCheckboxes input').forEach(cb => cb.checked = false);
    document.getElementById('tribeFormSubmit').textContent = 'Create Tribe';
    currentEditingTribeId = null;
}

// Replace the existing editTribe function with this new one
window.editTribe = async function(tribeId) {
    const tribeRef = ref(database, `tribes/${tribeId}`);
    const snapshot = await get(tribeRef);
    const tribe = snapshot.val();
    
    // Set the form to edit mode
    currentEditingTribeId = tribeId;
    
    // Fill in the tribe name
    document.getElementById('tribeName').value = tribe.name;
    
    // Check the appropriate member checkboxes
    document.querySelectorAll('#memberCheckboxes input').forEach(checkbox => {
        checkbox.checked = tribe.members.includes(checkbox.value);
    });
    
    // Update submit button text
    document.getElementById('tribeFormSubmit').textContent = 'Save Changes';
    
    // Scroll to the form
    document.getElementById('tribeForm').scrollIntoView({ behavior: 'smooth' });
};

// Update the deleteTribe function to reset the form if deleting the currently edited tribe
window.deleteTribe = async function(tribeId) {
    if (confirm('Are you sure you want to delete this tribe?')) {
        try {
            await remove(ref(database, `tribes/${tribeId}`));
            if (currentEditingTribeId === tribeId) {
                resetTribeForm();
            }
        } catch (error) {
            console.error("Error deleting tribe:", error);
            alert("Error deleting tribe");
        }
    }
};

// Add a cancel edit function
window.cancelTribeEdit = function() {
    resetTribeForm();
};

function renderPeople(people) {
    const peopleList = document.getElementById('peopleList');
    const memberCheckboxes = document.getElementById('memberCheckboxes');
    
    if (!peopleList || !memberCheckboxes) return;
    
    peopleList.innerHTML = Object.entries(people || {}).map(([id, person]) => `
        <div class="person-item">
            <span>${person.firstName} ${person.lastName}</span>
            <div class="actions">
                <button onclick="window.editPerson('${id}')">Edit Name</button>
                <button onclick="window.deletePerson('${id}')" class="delete-btn">Delete</button>
            </div>
        </div>
    `).join('');
    
    memberCheckboxes.innerHTML = Object.entries(people || {}).map(([id, person]) => `
        <label class="member-checkbox">
            <input type="checkbox" value="${id}">
            ${person.firstName} ${person.lastName}
        </label>
    `).join('');
}

function renderTribes(tribes, people) {
    const tribesList = document.getElementById('tribesList');
    if (!tribesList) return;
    
    tribesList.innerHTML = Object.entries(tribes || {}).map(([id, tribe]) => {
        const memberNames = tribe.members
            .map(memberId => {
                const person = people[memberId];
                return person ? `${person.firstName} ${person.lastName}` : '';
            })
            .filter(name => name)
            .join(', ');
            
        return `
            <div class="tribe-item">
                <div>
                    <strong>${tribe.name}</strong>
                    <div class="tribe-members">${memberNames}</div>
                </div>
                <div class="actions">
                    <button onclick="window.editTribe('${id}')">Edit</button>
                    <button onclick="window.deleteTribe('${id}')" class="delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Add these to window object
window.editPerson = async function(personId) {
    const personRef = ref(database, `people/${personId}`);
    const snapshot = await get(personRef);
    const person = snapshot.val();
    
    const fullName = prompt('Edit name (First Last):', `${person.firstName} ${person.lastName}`);
    
    if (fullName) {
        const [firstName, ...lastNameParts] = fullName.trim().split(' ');
        const lastName = lastNameParts.join(' ');
        
        if (firstName && lastName) {
            await set(personRef, {
                ...person,
                firstName,
                lastName
            });
        } else {
            alert('Please enter both first and last name');
        }
    }
};

window.deletePerson = async function(personId) {
    if (confirm('Are you sure you want to delete this person?')) {
        try {
            await remove(ref(database, `people/${personId}`));
        } catch (error) {
            console.error("Error deleting person:", error);
            alert("Error deleting person");
        }
    }
};

// Add function to populate tribe dropdown
function populateTribeDropdown(tribes, people) {
    const tribeSelect = document.getElementById('tribeSelect');
    if (!tribeSelect) return;
    
    tribeSelect.innerHTML = '<option value="">Choose a tribe...</option>' +
        Object.entries(tribes || {}).map(([id, tribe]) => {
            const memberCount = tribe.members.length;
            return `<option value="${id}">${tribe.name} (${memberCount} members)</option>`;
        }).join('');
}

// Add this function near the other window functions
window.openEventLink = function(eventId) {
    let linkText;
    if (eventId) {
        const linkElements = document.querySelectorAll(`.event-link[data-event-id="${eventId}"]`);
        if (linkElements.length > 0) {
            linkText = linkElements[0].value;
        }
    } else {
        const shareLinkInput = document.getElementById('shareLinkInput');
        if (shareLinkInput) {
            linkText = shareLinkInput.value;
        }
    }

    if (linkText) {
        window.open(linkText, '_blank');
    }
};

// Initialize - move this to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('eventForm').addEventListener('submit', createEvent);
    document.getElementById('dateInput').addEventListener('change', (e) => {
        // Only auto-add date if it's a specific date event type
        const eventType = document.querySelector('input[name="eventType"]:checked').value;
        if (e.target.value && eventType === 'specific') {
            addDate();
        }
    });
    loadEvents(); // Changed from loadEventReports()
    
    // Add event listeners for radio buttons
    document.querySelectorAll('input[name="eventType"]').forEach(radio => {
        radio.addEventListener('change', handleEventTypeChange);
    });
    
    handleEventTypeChange(); // Initialize the view
    
    // Add tab switching listeners
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.dataset.tab + 'View').classList.add('active');
        });
    });
    
    // Add tribe management form listeners
    document.getElementById('personForm')?.addEventListener('submit', addPerson);
    document.getElementById('tribeForm')?.addEventListener('submit', createTribe);
    
    // Set up real-time listeners for people and tribes
    const peopleRef = ref(database, 'people');
    const tribesRef = ref(database, 'tribes');
    
    onValue(peopleRef, (snapshot) => {
        const people = snapshot.val() || {};
        renderPeople(people);
    });
    
    onValue(tribesRef, (snapshot) => {
        get(peopleRef).then(peopleSnap => {
            const tribes = snapshot.val() || {};
            const people = peopleSnap.val() || {};
            renderTribes(tribes, people);
            populateTribeDropdown(tribes, people); // Add this line
        });
    });

    // Add reset handler for tribe form
    document.getElementById('tribeForm')?.addEventListener('reset', (e) => {
        e.preventDefault();
        cancelTribeEdit();
    });
});