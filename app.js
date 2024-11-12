// app.js
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { 
    getDatabase,
    ref, 
    set, 
    push,
    get,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updateProfile,
    updateEmail         // Add this import
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

// Initialize Firebase
console.log('Initializing Firebase...');
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

let selectedDates = [];
let currentEditingTribeId = null;
let currentUser = null; // Add this at the top with other global variables
let editingEventId = null; // Add at the top with other globals
let lastSelectedDate = null; // Add this near the top with other global variables

// Add these functions near the top with other globals
function getUserRef() {
    if (!currentUser) throw new Error('No user logged in');
    return `users/${currentUser.uid}`;
}

// Add this sorting utility function at the top with other utility functions
function sortPeopleArray(people) {
    return Object.entries(people)
        .sort((a, b) => {
            const nameA = `${a[1].firstName} ${a[1].lastName}`.toLowerCase();
            const nameB = `${b[1].firstName} ${b[1].lastName}`.toLowerCase();
            return nameA.localeCompare(nameB);
        });
}

// Add this helper function after getUserRef()
async function updateEventsForTribe(tribeId, updatedMembers) {
    if (!currentUser) return;
    
    try {
        const eventsRef = ref(database, `${getUserRef()}/events`);
        const eventsSnap = await get(eventsRef);
        const events = eventsSnap.val() || {};

        // Find all events using this tribe
        const updates = {};
        Object.entries(events).forEach(([eventId, event]) => {
            if (event.tribeId === tribeId) {
                // Keep existing votes for remaining members, remove votes for removed members
                const updatedParticipants = {};
                Object.entries(event.participants || {}).forEach(([name, data]) => {
                    if (updatedMembers.includes(data.memberId)) {
                        updatedParticipants[name] = data;
                    }
                });
                updates[`${getUserRef()}/events/${eventId}/participants`] = updatedParticipants;
            }
        });

        // Apply all updates
        for (const [path, value] of Object.entries(updates)) {
            await set(ref(database, path), value);
        }
    } catch (error) {
        console.error("Error updating events for tribe:", error);
        throw error;
    }
}

// Authentication functions
async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error logging in with Google:", error);
        alert("Error logging in with Google");
    }
}

async function loginWithEmail() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Error logging in with email:", error);
        alert("Error logging in with email");
    }
}

async function signupWithEmail() {
    const name = document.getElementById('signupNameInput').value;
    const email = document.getElementById('signupEmailInput').value;
    const password = document.getElementById('signupPasswordInput').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Set display name as entered name
        await updateProfile(user, {
            displayName: name
        });
        
    } catch (error) {
        console.error("Error signing up with email:", error);
        alert("Error signing up with email");
    }
}

async function logout() {
    try {
        await signOut(auth);
        window.location.href = 'login.html'; // Add this line to redirect to login.html
    } catch (error) {
        console.error("Error logging out:", error);
        alert("Error logging out");
    }
}

// Event handler functions
// Update addDate function
function addDate() {
    const eventType = document.querySelector('input[name="eventType"]:checked').value;
    let startDate, endDate;
    
    if (eventType === 'specific') {
        startDate = document.getElementById('specificDateInput').value;
        endDate = startDate;
    } else if (eventType === 'range') {
        startDate = document.getElementById('startDateInput').value;
        endDate = document.getElementById('endDateInput').value;
    }
    
    if (!startDate) {
        alert('Please select a start date');
        return;
    }

    const startDateTime = new Date(startDate + 'T00:00:00');
    let dateRange;

    if (eventType === 'specific') {
        dateRange = {
            start: startDate,
            end: startDate
        };
    } else if (eventType === 'range') {
        if (!endDate) {
            alert('Please select an end date');
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
        // Clear inputs
        if (eventType === 'specific') {
            document.getElementById('specificDateInput').value = '';
        } else {
            document.getElementById('startDateInput').value = '';
            document.getElementById('endDateInput').value = '';
        }
    }
}

// Attach functions to window object
window.addDate = addDate;
window.removeDate = function(startDate, endDate) {
    if (startDate === 'dayOfWeek') {
        selectedDates = selectedDates.filter(d => d.type !== 'dayOfWeek');
    } else {
        selectedDates = selectedDates.filter(d => !(d.start === startDate && d.end === endDate));
    }
    renderDates();
};
window.deletePerson = async function(personId) {
    if (!currentUser) return;
    
    if (confirm('Are you sure you want to delete this person? This will also remove them from any tribes.')) {
        try {
            // Get all tribes first
            const tribesRef = ref(database, `${getUserRef()}/tribes`);
            const tribesSnap = await get(tribesRef);
            const tribes = tribesSnap.val() || {};

            // Find affected tribes and update them
            for (const [tribeId, tribe] of Object.entries(tribes)) {
                if (tribe.members?.includes(personId)) {
                    const updatedMembers = tribe.members.filter(id => id !== personId);
                    await set(ref(database, `${getUserRef()}/tribes/${tribeId}/members`), updatedMembers);
                    await updateEventsForTribe(tribeId, updatedMembers);
                }
            }

            // Delete the person
            const personRef = ref(database, `${getUserRef()}/people/${personId}`);
            await remove(personRef);

            alert('Person deleted successfully');
        } catch (error) {
            console.error("Error deleting person:", error);
            alert("Error deleting person. Please try again.");
        }
    }
};

// Remove this old function
// window.copyLink = function() {
//     const linkInput = document.getElementById('shareLinkInput');
//     linkInput.select();
//     document.execCommand('copy');
// };

// Add this utility function
function getVoteUrl(eventId) {
    if (!currentUser) return '';
    return `${window.location.origin}/vote.html?event=${eventId}&user=${currentUser.uid}`;
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

// After copyEventLink function
window.openEventLink = function(eventId) {
    try {
        let url;
        if (eventId) {
            // Called from event report
            const linkElements = document.querySelectorAll(`.event-link[data-event-id="${eventId}"]`);
            if (linkElements.length > 0) {
                url = linkElements[0].value;
            }
        } else {
            // Called from create event view
            const shareLinkInput = document.getElementById('shareLinkInput');
            if (shareLinkInput) {
                url = shareLinkInput.value;
            }
        }

        if (!url) {
            throw new Error('Could not find URL to open');
        }

        window.open(url, '_blank');
    } catch (err) {
        console.error('Failed to open link:', err);
        alert('Failed to open link');
    }
};

// Add delete event function
window.deleteEvent = async function(eventId) {
    if (!currentUser) return;
    
    if (confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
        try {
            const eventRef = ref(database, `users/${currentUser.uid}/events/${eventId}`);
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

// Update createEvent function
async function createEvent(e) {
    e.preventDefault();
    if (!currentUser) {
        alert('Please login first');
        return;
    }
    
    const tribeId = document.getElementById('tribeSelect').value;
    if (!tribeId) {
        alert('Please select a tribe for this event');
        return;
    }

    const eventData = {
        title: document.getElementById('eventTitle').value,
        description: document.getElementById('eventDescription').value,
        type: document.querySelector('input[name="eventType"]:checked').value,
        // Add anonymous setting
        anonymous: document.getElementById('anonymousResponses').checked,
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
        userId: currentUser.uid,
        created: new Date().toISOString(),
        tribeId: tribeId
    };

    try {
        let eventRef;
        if (editingEventId) {
            // Update existing event
            eventRef = ref(database, `${getUserRef()}/events/${editingEventId}`);
            // Preserve creation data and votes
            const existingEvent = (await get(eventRef)).val();
            eventData.created = existingEvent.created;
            eventData.participants = existingEvent.participants || {};
            
            // Resize existing participant vote arrays to match new dates length
            const newDatesLength = eventData.dates.length;
            const participants = existingEvent.participants || {};
            
            Object.keys(participants).forEach(participantId => {
                const currentVotes = participants[participantId].votes || [];
                // Extend votes array with neutral votes (1) for new dates
                while (currentVotes.length < newDatesLength) {
                    currentVotes.push(1);
                }
                // Trim extra votes if dates were removed
                participants[participantId].votes = currentVotes.slice(0, newDatesLength);
            });
            
            eventData.participants = participants;
        } else {
            // Create new event
            eventRef = push(ref(database, `${getUserRef()}/events`));
            eventData.created = new Date().toISOString();
            eventData.participants = {};
        }

        await set(eventRef, eventData);
        
        // Reset form and state
        document.getElementById('eventForm').reset();
        selectedDates = [];
        renderDates();
        
        if (editingEventId) {
            editingEventId = null;
            document.querySelector('#eventForm button[type="submit"]').textContent = 'Create Event';
            const cancelBtn = document.querySelector('.cancel-edit-btn');
            if (cancelBtn) cancelBtn.remove();
            
            // Switch to Events tab after update
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.querySelector('[data-tab="events"]').classList.add('active');
            document.getElementById('eventsView').classList.add('active');
            
            alert('Event updated successfully');
        } else {
            // Show share link for new events
            const voteUrl = getVoteUrl(eventRef.key);
            document.getElementById('shareLinkInput').value = voteUrl;
            document.getElementById('shareLink').style.display = 'block';
        }
    } catch (error) {
        console.error("Error managing event: ", error);
        alert("Error managing event. Please try again.");
    }
};

function renderEventReport(eventId, eventData) {
    // Get tribe info - this will be populated by the loadEvents function
    const tribeInfo = eventData.tribeInfo || { name: 'Unknown Group' };
    
    const votes = eventData.participants || {};
    const dateRanges = eventData.dates || [];
    const voteUrl = `${window.location.origin}/vote.html?event=${eventId}&user=${currentUser.uid}`;
    
    // Calculate totals for each individual option (date or day)
    let totals = [];
    if (dateRanges[0]?.type === 'dayOfWeek') {
        // For day of week events, spread the days into individual options
        dateRanges.forEach(range => {
            range.days.forEach((day, dayIndex) => {
                const dayTotal = Object.values(votes).reduce((acc, participant) => {
                    if (participant.votes && participant.votes[dayIndex] !== undefined) {
                        if (participant.votes[dayIndex] === 2) {
                            acc.yes++;
                        } else if (participant.votes[dayIndex] === 0) {
                            acc.no++;
                        }
                    }
                    return acc;
                }, { yes: 0, no: 0 });
                totals.push(dayTotal);
            });
        });
    } else {
        // For regular date events, calculate totals as before
        totals = dateRanges.map((_, index) => {
            return Object.values(votes).reduce((acc, participant) => {
                if (participant.votes && participant.votes[index] !== undefined) {
                    if (participant.votes[index] === 2) {
                        acc.yes++;
                    } else if (participant.votes[index] === 0) {
                        acc.no++;
                    }
                }
                return acc;
            }, { yes: 0, no: 0 });
        });
    }

    // Rest of the rendering code remains the same but uses the corrected totals
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
                <div class="event-actions">
                    <label class="anonymous-toggle">
                        <input type="checkbox" 
                            ${eventData.anonymous ? 'checked' : ''} 
                            onchange="window.toggleAnonymous('${eventId}', this.checked)">
                        Anonymous Responses
                    </label>
                    <button class="edit-dates-btn" onclick="window.editEventDates('${eventId}')">Edit Dates</button>
                    <button class="delete-event-btn" onclick="deleteEvent('${eventId}')">Delete Event</button>
                </div>
            </div>
            <div class="description-container">
                <p class="event-description">${eventData.description || 'No description'}</p>
                <button class="edit-icon" onclick="window.editEventField('${eventId}', 'description', '${eventData.description || ''}')">
                    ✏️
                </button>
            </div>
            <div class="tribe-info">
                <h4>Group</h4>
                <p>${tribeInfo.name}</p>
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
                        if (range.type === 'dayOfWeek') {
                            return range.days.map((day, dayIndex) => `
                                <tr>
                                    <td>${day}</td>
                                    <td>${totals[dayIndex].yes}</td>
                                    <td>${totals[dayIndex].no}</td>
                                </tr>
                            `).join('');
                        }
                        return `
                            <tr>
                                <td>${range.start === range.end ? 
                                    formatDateForDisplay(range.start) :
                                    `${formatDateForDisplay(range.start)} to ${formatDateForDisplay(range.end)}`}</td>
                                <td>${totals[i].yes}</td>
                                <td>${totals[i].no}</td>
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
                            if (range.type === 'dayOfWeek') {
                                return range.days.map(day => `<th>${day}</th>`).join('');
                            }
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
    if (!currentUser) return;
    
    let newValue = prompt(`Edit event ${field}:`, currentValue);
    
    if (newValue !== null && newValue !== currentValue) {
        try {
            const updates = {};
            updates[field] = newValue;
            
            const eventRef = ref(database, `users/${currentUser.uid}/events/${eventId}`);
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

// Add these new functions
window.editEventDates = async function(eventId) {
    if (!currentUser) return;
    
    try {
        const eventRef = ref(database, `${getUserRef()}/events/${eventId}`);
        const eventSnap = await get(eventRef);
        const eventData = eventSnap.val();
        
        if (!eventData) {
            throw new Error('Event not found');
        }

        // Switch to create event view
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="createEvent"]').classList.add('active');
        document.getElementById('createEventView').classList.add('active');
        
        // Populate form with existing data
        document.getElementById('eventTitle').value = eventData.title;
        document.getElementById('eventDescription').value = eventData.description;
        document.getElementById('tribeSelect').value = eventData.tribeId;
        
        // Set event type
        document.querySelector(`input[name="eventType"][value="${eventData.type}"]`).checked = true;
        handleEventTypeChange();
        
        // Load existing dates
        selectedDates = eventData.dates.map(date => {
            if (date.type === 'dayOfWeek') {
                return {
                    type: 'dayOfWeek',
                    days: date.days
                };
            }
            return {
                start: date.start,
                end: date.end
            };
        });
        
        renderDates();
        editingEventId = eventId;
        
        // Update form submit button text
        const submitBtn = document.querySelector('#eventForm button[type="submit"]');
        submitBtn.textContent = 'Update Event';
        
        // Show cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'cancel-edit-btn';
        cancelBtn.textContent = 'Cancel Edit';
        cancelBtn.onclick = cancelEventEdit;
        submitBtn.parentNode.appendChild(cancelBtn);

        document.getElementById('anonymousResponses').checked = eventData.anonymous || false;
    } catch (error) {
        console.error('Error loading event for editing:', error);
        alert('Error loading event for editing');
    }
};

function cancelEventEdit() {
    editingEventId = null;
    selectedDates = [];
    document.getElementById('eventForm').reset();
    renderDates();
    
    // Reset submit button
    const submitBtn = document.querySelector('#eventForm button[type="submit"]');
    submitBtn.textContent = 'Create Event';
    
    // Remove cancel button
    const cancelBtn = document.querySelector('.cancel-edit-btn');
    if (cancelBtn) cancelBtn.remove();

    // Switch to Events tab
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="events"]').classList.add('active');
    document.getElementById('eventsView').classList.add('active');
}

// Change function name from loadEventReports to loadEvents
async function loadEvents() {
    if (!currentUser) return;
    
    const eventsRef = ref(database, `${getUserRef()}/events`);
    const tribesRef = ref(database, `${getUserRef()}/tribes`);
    
    onValue(eventsRef, async (snapshot) => {
        const events = snapshot.val() || {};
        const tribesSnap = await get(tribesRef);
        const tribes = tribesSnap.val() || {};
        
        // Enhance events with tribe info
        const enhancedEvents = Object.entries(events).map(([eventId, eventData]) => {
            return [eventId, {
                ...eventData,
                tribeInfo: tribes[eventData.tribeId] || { name: 'Unknown Group' }
            }];
        });
        
        const eventsHtml = enhancedEvents
            .map(([eventId, eventData]) => renderEventReport(eventId, eventData))
            .join('');
        document.getElementById('eventsList').innerHTML = eventsHtml;
    });
}

// Add this function to handle radio button changes
function handleEventTypeChange() {
    const eventType = document.querySelector('input[name="eventType"]:checked')?.value;
    const specificDateField = document.querySelector('.specific-date');
    const rangeDateField = document.querySelector('.range-date');
    const dayOfWeekSelector = document.getElementById('dayOfWeekSelector');
    const addSpecificDateBtn = document.getElementById('addSpecificDateBtn');
    const addDateBtn = document.getElementById('addDateBtn');
    const addDaysBtn = document.getElementById('addDaysBtn');

    if (!eventType || !specificDateField || !rangeDateField || !dayOfWeekSelector || !addSpecificDateBtn || !addDateBtn || !addDaysBtn) {
        return;
    }

    specificDateField.style.display = 'none';
    rangeDateField.style.display = 'none';
    dayOfWeekSelector.style.display = 'none';
    addSpecificDateBtn.style.display = 'none';
    addDateBtn.style.display = 'none';
    addDaysBtn.style.display = 'none';

    switch(eventType) {
        case 'specific':
            specificDateField.style.display = 'block';
            addSpecificDateBtn.style.display = 'block';
            break;
        case 'range':
            rangeDateField.style.display = 'block';
            addDateBtn.style.display = 'block';
            break;
        case 'dayOfWeek':
            dayOfWeekSelector.style.display = 'block';
            addDaysBtn.style.display = 'block';
            break;
    }
}

// Add reset handler for tribe form
document.getElementById('tribeForm')?.addEventListener('reset', (e) => {
    e.preventDefault();
    cancelTribeEdit();
});

// Add back the missing tribe management functions
async function addPerson(e) {
    e.preventDefault();
    if (!currentUser) {
        alert('Please login first');
        return;
    }
    
    const fullName = document.getElementById('personName').value.trim();
    
    if (fullName) {
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ');
        
        if (!lastName) {
            alert('Please enter both first and last name');
            return;
        }
        
        try {
            const peopleRef = ref(database, `${getUserRef()}/people`);
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

// Add person deletion function
window.deletePerson = async function(personId) {
    if (!currentUser) return;
    
    if (confirm('Are you sure you want to delete this person? This will also remove them from any tribes.')) {
        try {
            // First, get all tribes to update their member lists
            const tribesRef = ref(database, `${getUserRef()}/tribes`);
            const tribesSnap = await get(tribesRef);
            const tribes = tribesSnap.val() || {};

            // Remove the person from all tribes
            const tribeUpdates = {};
            Object.entries(tribes).forEach(([tribeId, tribe]) => {
                if (tribe.members?.includes(personId)) {
                    tribeUpdates[`${getUserRef()}/tribes/${tribeId}/members`] = 
                        tribe.members.filter(id => id !== personId);
                }
            });

            // Delete the person
            const personRef = ref(database, `${getUserRef()}/people/${personId}`);
            await remove(personRef);

            // Update all affected tribes
            for (const [path, value] of Object.entries(tribeUpdates)) {
                await set(ref(database, path), value);
            }

            alert('Person deleted successfully');
        } catch (error) {
            console.error("Error deleting person:", error);
            alert("Error deleting person. Please try again.");
        }
    }
};

// Add back tribe management functions
function renderPeople(people) {
    const peopleList = document.getElementById('peopleList');
    const memberCheckboxes = document.getElementById('memberCheckboxes');
    
    if (!peopleList || !memberCheckboxes) return;
    
    const sortedPeople = sortPeopleArray(people || {});
    
    peopleList.innerHTML = sortedPeople.map(([id, person]) => `
        <div class="person-item">
            <span>${person.firstName} ${person.lastName}</span>
            <div class="actions">
                <button onclick="window.editPerson('${id}')">Edit Name</button>
                <button onclick="window.deletePerson('${id}')" class="delete-btn">Delete</button>
            </div>
        </div>
    `).join('');
    
    memberCheckboxes.innerHTML = sortedPeople.map(([id, person]) => `
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
            .map(memberId => people[memberId])
            .filter(Boolean)
            .map(person => `${person.firstName} ${person.lastName}`)
            .join(', ');
            
        return `
            <div class="tribe-item">
                <div>
                    <strong>${tribe.name}</strong>
                    <p>${memberNames}</p>
                </div>
                <div class="actions">
                    <button onclick="editTribe('${id}')">Edit</button>
                    <button onclick="deleteTribe('${id}')" class="delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}



// Add tribe management functions
async function createTribe(e) {
    e.preventDefault();
    if (!currentUser) {
        alert('Please login first');
        return;
    }

    const tribeName = document.getElementById('tribeName').value.trim();
    const selectedMembers = Array.from(document.querySelectorAll('#memberCheckboxes input:checked')).map(cb => cb.value);

    if (!tribeName) {
        alert('Please enter a tribe name');
        return;
    }
    if (selectedMembers.length === 0) {
        alert('Please select at least one member');
        return;
    }

    try {
        const tribesRef = ref(database, `${getUserRef()}/tribes`);
        
        // If we're editing an existing tribe, update it instead of creating new
        if (currentEditingTribeId) {
            const tribeRef = ref(database, `${getUserRef()}/tribes/${currentEditingTribeId}`);
            await set(tribeRef, {
                name: tribeName,
                members: selectedMembers,
                updated: new Date().toISOString()
            });
            
            // Update associated events
            await updateEventsForTribe(currentEditingTribeId, selectedMembers);
            alert('Group updated successfully');  // Add this line
        } else {
            // Create new tribe
            const newTribeRef = push(tribesRef);
            await set(newTribeRef, {
                name: tribeName,
                members: selectedMembers,
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            });
        }

        // Reset form
        document.getElementById('tribeName').value = '';
        document.querySelectorAll('#memberCheckboxes input').forEach(cb => cb.checked = false);
        
        if (currentEditingTribeId) {
            currentEditingTribeId = null;
            document.getElementById('tribeFormSubmit').textContent = 'Create Group';
        }
    } catch (error) {
        console.error("Error managing tribe:", error);
        alert("Error managing group");
    }
}

// Add these window functions for tribe management
window.editTribe = async function(tribeId) {
    currentEditingTribeId = tribeId;
    const tribeRef = ref(database, `${getUserRef()}/tribes/${tribeId}`);
    const tribeSnap = await get(tribeRef);
    const tribe = tribeSnap.val();

    if (tribe) {
        document.getElementById('tribeName').value = tribe.name;
        document.querySelectorAll('#memberCheckboxes input').forEach(cb => {
            cb.checked = tribe.members.includes(cb.value);
        });
        document.getElementById('tribeFormSubmit').textContent = 'Update Group';  // Changed from 'Update Tribe'
    }
};

window.deleteTribe = async function(tribeId) {
    if (!currentUser) return;
    
    if (confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
        try {
            const tribeRef = ref(database, `${getUserRef()}/tribes/${tribeId}`);
            await remove(tribeRef);
            alert('Group deleted successfully');  // Changed from 'Tribe deleted successfully'
        } catch (error) {
            console.error("Error deleting tribe:", error);
            alert("Error deleting group. Please try again.");  // Changed from "tribe" to "group"
        }
    }
};


function populateTribeDropdown(tribes, people) {
    const tribeSelect = document.getElementById('tribeSelect');
    if (!tribeSelect) return;

    const sortedPeople = sortPeopleArray(people || {});
    const peopleMap = Object.fromEntries(sortedPeople);

    tribeSelect.innerHTML = '<option value="">Choose a group...</option>' +
        Object.entries(tribes || {}).map(([id, tribe]) => {
            const memberNames = tribe.members
                .map(memberId => peopleMap[memberId])
                .filter(Boolean)
                .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName))
                .map(person => `${person.firstName}`)
                .join(', ');
            return `<option value="${id}">${tribe.name} (${memberNames})</option>`;
        }).join('');
}

function cancelTribeEdit() {
    currentEditingTribeId = null;
    document.getElementById('tribeName').value = '';
    document.querySelectorAll('#memberCheckboxes input').forEach(cb => cb.checked = false);
    document.getElementById('tribeFormSubmit').textContent = 'Create Group';  // Changed from 'Create Tribe'
}

// Add this function to handle editing a person's name
window.editPerson = async function(personId) {
    if (!currentUser) return;

    const personRef = ref(database, `${getUserRef()}/people/${personId}`);
    const personSnap = await get(personRef);
    const person = personSnap.val();

    if (person) {
        const newFirstName = prompt("Edit First Name:", person.firstName);
        const newLastName = prompt("Edit Last Name:", person.lastName);

        if (newFirstName !== null && newLastName !== null) {
            try {
                await set(personRef, {
                    ...person,
                    firstName: newFirstName,
                    lastName: newLastName
                });
                alert('Person updated successfully');
            } catch (error) {
                console.error("Error updating person:", error);
                alert("Error updating person. Please try again.");
            }
        }
    }
};

// Add this new function
async function updateProfileInfo(e) {
    e.preventDefault();
    const newName = document.getElementById('profileName').value;
    const newEmail = document.getElementById('profileEmail').value;
    
    if (!newName || !newEmail) {
        alert('Please enter both name and email');
        return;
    }

    try {
        // Update display name
        await updateProfile(auth.currentUser, {
            displayName: newName
        });

        // Update email using the correct method
        await updateEmail(auth.currentUser, newEmail);
        
        alert('Profile updated successfully');
        document.getElementById('userName').textContent = newName;
    } catch (error) {
        console.error("Error updating profile:", error);
        // More specific error message
        if (error.code === 'auth/requires-recent-login') {
            alert("For security reasons, please log out and log back in before changing your email.");
        } else {
            alert("Error updating profile: " + error.message);
        }
    }
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    // Add authentication event listeners only if elements exist
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    const emailLoginSubmitBtn = document.getElementById('emailLoginSubmitBtn');
    const emailSignupBtn = document.getElementById('emailSignupBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    googleLoginBtn?.addEventListener('click', loginWithGoogle);
    emailLoginBtn?.addEventListener('click', () => {
        document.getElementById('emailLoginForm').style.display = 'block';
    });
    emailLoginSubmitBtn?.addEventListener('click', loginWithEmail);
    emailSignupBtn?.addEventListener('click', signupWithEmail);
    logoutBtn?.addEventListener('click', logout);

    // Add form listeners with optional chaining
    document.getElementById('eventForm')?.addEventListener('submit', createEvent);
    document.getElementById('personForm')?.addEventListener('submit', addPerson);
    document.getElementById('tribeForm')?.addEventListener('submit', createTribe);
    
    // Add date input listener if element exists
    document.getElementById('dateInput')?.addEventListener('change', (e) => {
        const eventType = document.querySelector('input[name="eventType"]:checked')?.value;
        if (e.target.value && eventType === 'specific') {
            addDate();
        }
    });
    
    // Add event type radio listeners if they exist
    document.querySelectorAll('input[name="eventType"]')?.forEach(radio => {
        radio.addEventListener('change', handleEventTypeChange);
    });
    
    // Add tab switching listeners if they exist
    document.querySelectorAll('.tab-button')?.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.dataset.tab + 'View').classList.add('active');
        });
    });

    // Initialize view if needed
    if (document.querySelector('input[name="eventType"]')) {
        handleEventTypeChange();
    }

    // Add event listener for profile update
    document.getElementById('profileForm')?.addEventListener('submit', updateProfileInfo);

    // Add select all members button handler
    document.getElementById('selectAllMembers')?.addEventListener('click', () => {
        document.querySelectorAll('#memberCheckboxes input[type="checkbox"]')
            .forEach(checkbox => checkbox.checked = true);
    });

    // Initialize authentication state
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('mainContainer').style.display = 'block';
            
            // Display user name
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.displayName || user.email;
            }

            // Populate profile form
            document.getElementById('profileName').value = user.displayName || '';
            document.getElementById('profileEmail').value = user.email || '';
            
            loadEvents();
            
            // Set up real-time listeners for people and tribes
            const peopleRef = ref(database, `${getUserRef()}/people`);
            const tribesRef = ref(database, `${getUserRef()}/tribes`);
            
            onValue(peopleRef, (snapshot) => {
                const people = snapshot.val() || {};
                renderPeople(people);
            });
            
            onValue(tribesRef, (snapshot) => {
                get(peopleRef).then(peopleSnap => {
                    const tribes = snapshot.val() || {};
                    const people = peopleSnap.val() || {};
                    renderTribes(tribes, people);
                    populateTribeDropdown(tribes, people);
                });
            });
        } else {
            currentUser = null;
            window.location.href = 'login.html';
        }
    });

    // Add these new event listeners for date inputs
    const startDateInput = document.getElementById('startDateInput');
    const endDateInput = document.getElementById('endDateInput');
    const specificDateInput = document.getElementById('specificDateInput');

    // Function to set default date when opening date picker
    function setDefaultDate(input) {
        if (lastSelectedDate) {
            // Set the input's default view to the last selected month/year
            const defaultView = lastSelectedDate.toISOString().split('T')[0];
            input.setAttribute('min', new Date().toISOString().split('T')[0]); // Prevent past dates
            if (!input.value) {  // Only set if no date is currently selected
                input.valueAsDate = new Date(defaultView);
            }
        }
    }

    // Add focus event listeners to set default date
    startDateInput?.addEventListener('focus', () => setDefaultDate(startDateInput));
    endDateInput?.addEventListener('focus', () => setDefaultDate(endDateInput));
    specificDateInput?.addEventListener('focus', () => setDefaultDate(specificDateInput));

    // Add change event listeners to update lastSelectedDate
    startDateInput?.addEventListener('change', (e) => {
        if (e.target.value) {
            lastSelectedDate = new Date(e.target.value);
            // Update end date min value to prevent selecting earlier dates
            endDateInput.setAttribute('min', e.target.value);
        }
    });

    endDateInput?.addEventListener('change', (e) => {
        if (e.target.value) {
            lastSelectedDate = new Date(e.target.value);
        }
    });

    specificDateInput?.addEventListener('change', (e) => {
        if (e.target.value) {
            lastSelectedDate = new Date(e.target.value);
        }
    });
});

// Add this new function to handle the anonymous toggle
window.toggleAnonymous = async function(eventId, isAnonymous) {
    if (!currentUser) return;
    
    try {
        const eventRef = ref(database, `${getUserRef()}/events/${eventId}`);
        await set(eventRef, {
            ...(await get(eventRef)).val(),
            anonymous: isAnonymous
        });
        // The real-time listener will automatically update the UI
    } catch (error) {
        console.error("Error updating anonymous setting:", error);
        alert("Error updating anonymous setting");
    }
};