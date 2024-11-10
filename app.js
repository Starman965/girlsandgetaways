// app.js
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getDatabase,
    ref, 
    set, 
    push,
    get,
    onValue
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// Initialize Firebase
console.log('Initializing Firebase...');
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

let selectedDates = [];

// Event handler functions
function addDate() {
    const startDate = document.getElementById('dateInput').value;
    const endDate = document.getElementById('endDateInput').value;
    
    if (startDate && endDate) {
        if (new Date(endDate) < new Date(startDate)) {
            alert('End date must be after start date');
            return;
        }
        
        const dateRange = {
            start: startDate,
            end: endDate
        };
        
        const rangeString = `${startDate}|${endDate}`;
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
window.copyLink = function() {
    const linkInput = document.getElementById('shareLinkInput');
    linkInput.select();
    document.execCommand('copy');
};

function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit'
    });
}

function renderDates() {
    const datesList = document.getElementById('datesList');
    datesList.innerHTML = selectedDates.map(dateRange => `
        <div class="date-tag">
            ${formatDateForDisplay(dateRange.start)} to ${formatDateForDisplay(dateRange.end)}
            <button onclick="removeDate('${dateRange.start}', '${dateRange.end}')">&times;</button>
        </div>
    `).join('');
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
        const voteUrl = `${window.location.origin}/vote.html?event=${newEventRef.key}`;
        
        document.getElementById('shareLinkInput').value = voteUrl;
        document.getElementById('shareLink').style.display = 'block';
        console.log('Event created successfully:', newEventRef.key);
    } catch (error) {
        console.error("Error creating event: ", error);
        alert("Error creating event. Please try again.");
    }
}

window.copyEventLink = function(eventId) {
    const voteUrl = `${window.location.origin}/vote.html?event=${eventId}`;
    navigator.clipboard.writeText(voteUrl).then(() => {
        alert('Link copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
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
            <h3>${eventData.title}</h3>
            <p>${eventData.description || ''}</p>
            
            <div class="event-link-container">
                <input class="event-link" type="text" readonly value="${voteUrl}">
                <button class="copy-button" onclick="copyEventLink('${eventId}')">Copy Link</button>
            </div>

            <div class="votes-summary">
                <h4>Summary</h4>
                <table class="report-table">
                    <tr>
                        <th>Date Range</th>
                        <th>Yes</th>
                        <th>No</th>
                    </tr>
                    ${dateRanges.map((range, i) => `
                        <tr>
                            <td>${range.displayRange}</td>
                            <td>${totals[i].yes}</td>
                            <td>${totals[i].no}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>

            <div class="individual-votes">
                <h4>Individual Responses</h4>
                <table class="report-table">
                    <tr>
                        <th>Name</th>
                        ${dateRanges.map(range => `<th>${range.displayRange}</th>`).join('')}
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

// Initialize - move this to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('eventForm').addEventListener('submit', createEvent);
    document.getElementById('dateInput').addEventListener('change', (e) => {
        if (e.target.value) {
            addDate();
        }
    });
    loadEventReports();
});