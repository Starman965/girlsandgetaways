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
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

// Initialize Firebase
console.log('Initializing Firebase...');
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

let selectedDates = [];
let currentEditingTribeId = null;
let currentUser = null; // Add this at the top with other global variables

// Add these functions near the top with other globals
function getUserRef() {
    if (!currentUser) throw new Error('No user logged in');
    return `users/${currentUser.uid}`;
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
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Set display name as email username
        const displayName = email.split('@')[0];
        await updateProfile(user, {
            displayName: displayName
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
        const eventsRef = ref(database, `${getUserRef()}/events`);
        const newEventRef = push(eventsRef);
        await set(newEventRef, eventData);
        
        // Generate and display the vote URL
        const voteUrl = `${window.location.origin}/vote.html?event=${newEventRef.key}&user=${currentUser.uid}`;
        const shareLinkInput = document.getElementById('shareLinkInput');
        if (shareLinkInput) {
            shareLinkInput.value = voteUrl;
            document.getElementById('shareLink').style.display = 'block';
        }
        
        // Clear the form
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDescription').value = '';
        document.getElementById('specificDateInput').value = '';
        document.getElementById('startDateInput').value = '';
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
    const voteUrl = `${window.location.origin}/vote.html?event=${eventId}&user=${currentUser.uid}`;
    
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

// Change function name from loadEventReports to loadEvents
async function loadEvents() {
    if (!currentUser) return;
    
    const eventsRef = ref(database, `${getUserRef()}/events`);
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
        const newTribeRef = push(tribesRef);
        await set(newTribeRef, {
            name: tribeName,
            members: selectedMembers,
            created: new Date().toISOString(),
            updated: new Date().toISOString()
        });

        // Reset form
        document.getElementById('tribeName').value = '';
        document.querySelectorAll('#memberCheckboxes input').forEach(cb => cb.checked = false);
        
        if (currentEditingTribeId) {
            currentEditingTribeId = null;
            document.getElementById('tribeFormSubmit').textContent = 'Create Tribe';
        }
    } catch (error) {
        console.error("Error creating tribe:", error);
        alert("Error creating tribe");
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
        document.getElementById('tribeFormSubmit').textContent = 'Update Tribe';
    }
};

window.deleteTribe = async function(tribeId) {
    if (!currentUser) return;
    
    if (confirm('Are you sure you want to delete this tribe? This action cannot be undone.')) {
        try {
            const tribeRef = ref(database, `${getUserRef()}/tribes/${tribeId}`);
            await remove(tribeRef);
            alert('Tribe deleted successfully');
        } catch (error) {
            console.error("Error deleting tribe:", error);
            alert("Error deleting tribe. Please try again.");
        }
    }
};


function populateTribeDropdown(tribes, people) {
    const tribeSelect = document.getElementById('tribeSelect');
    if (!tribeSelect) return;

    tribeSelect.innerHTML = '<option value="">Choose a tribe...</option>' +
        Object.entries(tribes || {}).map(([id, tribe]) => {
            const memberNames = tribe.members
                .map(memberId => people[memberId])
                .filter(Boolean)
                .map(person => `${person.firstName}`)
                .join(', ');
            return `<option value="${id}">${tribe.name} (${memberNames})</option>`;
        }).join('');
}

function cancelTribeEdit() {
    currentEditingTribeId = null;
    document.getElementById('tribeName').value = '';
    document.querySelectorAll('#memberCheckboxes input').forEach(cb => cb.checked = false);
    document.getElementById('tribeFormSubmit').textContent = 'Create Tribe';
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
});