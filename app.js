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

// Add this new function
window.copyEventLink = async function() {
    try {
        const linkInput = document.getElementById('shareLinkInput');
        await navigator.clipboard.writeText(linkInput.value);
        alert('Link copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback to old method if Clipboard API fails
        const linkInput = document.getElementById('shareLinkInput');
        linkInput.select();
        try {
            document.execCommand('copy');
            alert('Link copied to clipboard!');
        } catch (e) {
            console.error('Fallback copy failed:', e);
            alert('Failed to copy link. Please copy it manually.');
        }
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

function renderDates() {
    const datesList = document.getElementById('datesList');
    datesList.innerHTML = selectedDates.map(dateRange => {
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
    
    const eventData = {
        title: document.getElementById('eventTitle').value,
        description: document.getElementById('eventDescription').value,
        dates: selectedDates.map(dateRange => ({
            start: dateRange.start,
            end: dateRange.end,
            displayRange: `${formatDateForDisplay(dateRange.start)} to ${formatDateForDisplay(dateRange.end)}`
        })),
        createdBy: 'anonymous',
        participants: {},
        created: new Date().toISOString()
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
    const voteUrl = `${window.location.origin}/vote.html?event=${eventId}`;
    
    // Calculate totals for each date range
    const totals = dateRanges.map((_, index) => {
        const yesVotes = Object.values(votes).filter(p => p.votes[index] === 2).length;
        const noVotes = Object.values(votes).filter(p => p.votes[index] === 0).length;
        return { yes: yesVotes, no: noVotes };
    });

    return `
        <div class="event-report">
            <div class="event-header">
                <h3>${eventData.title}</h3>
                <button class="delete-event-btn" onclick="deleteEvent('${eventId}')">Delete Event</button>
            </div>
            <p>${eventData.description || ''}</p>
            
            <div class="event-link-container">
                <input class="event-link" type="text" readonly value="${voteUrl}">
                <button class="copy-button" onclick="copyEventLink('${eventId}')">Copy Link</button>
            </div>

            <div class="votes-summary">
                <h4>Summary</h4>
                <table class="report-table">
                    <tr>
                        <th>${dateRanges[0]?.start === dateRanges[0]?.end ? 'Date' : 'Date Range'}</th>
                        <th>Yes</th>
                        <th>No</th>
                    </tr>
                    ${dateRanges.map((range, i) => {
                        const isSpecificDate = range.start === range.end;
                        const displayDate = isSpecificDate ? 
                            formatDateForDisplay(range.start) :
                            `${formatDateForDisplay(range.start)} to ${formatDateForDisplay(range.end)}`;
                        return `
                            <tr>
                                <td>${displayDate}</td>
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

async function loadEventReports() {
    const eventsRef = ref(database, 'events');
    onValue(eventsRef, (snapshot) => {
        const events = snapshot.val() || {};
        const reportsHtml = Object.entries(events)
            .map(([eventId, eventData]) => renderEventReport(eventId, eventData))
            .join('');
        document.getElementById('eventReports').innerHTML = reportsHtml;
    });
}

// Add this function to handle radio button changes
function handleEventTypeChange() {
    const eventType = document.querySelector('input[name="eventType"]:checked').value;
    const endDateField = document.querySelector('.range-date');
    const addButton = document.getElementById('addDateBtn');
    
    if (eventType === 'specific') {
        endDateField.style.display = 'none';
        addButton.textContent = 'Add Date';
    } else {
        endDateField.style.display = 'block';
        addButton.textContent = 'Add Date Range';
    }
}

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
    loadEventReports();
    
    // Add event listeners for radio buttons
    document.querySelectorAll('input[name="eventType"]').forEach(radio => {
        radio.addEventListener('change', handleEventTypeChange);
    });
    
    handleEventTypeChange(); // Initialize the view
});