
import fetch from 'node-fetch';

async function run() {
    try {
        const res = await fetch('http://localhost:5000/api/v1/trips/generate-itinerary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destination: "New York",
                days: 3,
                persons: 1,
                budget: 100000,
                typeOfTrip: "relaxed",
                travelMedium: "flight"
            })
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text.slice(0, 2000)); // Log enough to see place names
    } catch (e) {
        console.error(e);
    }
}
run();
