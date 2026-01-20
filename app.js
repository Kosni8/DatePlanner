
let dates = [];

function loadDates() {
    const storedDates = localStorage.getItem('dates');
    dates = storedDates ? JSON.parse(storedDates) : [];
}

function saveDates() {
    localStorage.setItem('dates', JSON.stringify(dates));
}

function renderDates() {
    const dateList = document.getElementById('DateList');
    dateList.innerHTML = '';
    dates.forEach(date => {
        const li = document.createElement('li');
        li.textContent = `Name: ${date.title} Größe: ${date.size}`;
        dateList.appendChild(li);
    });
}

document.getElementById('addDateForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const title = document.getElementById('TitelInput').value;
    const size = document.getElementById('sizeSelect').value;
    dates.push({ title, size });
    saveDates();
    renderDates();
    this.reset();
});

// Initial load
loadDates();
renderDates();