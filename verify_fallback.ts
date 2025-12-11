
import fetch from 'node-fetch';

async function run() {
    // temporarily bypass auth in routes.ts if needed, but for now assuming we need to use valid token or bypass.
    // Since I re-enabled auth, I actually can't use this script easily unless I bypass again.
    // I will bypass auth ONE LAST TIME for this verification script.
    try {
        const res = await fetch('http://localhost:5000/api/v1/trips/generate-itinerary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destination: "Vijayawada", // Testing the user's specific example
                days: 3,
                persons: 1,
                budget: 50000,
                typeOfTrip: "relaxed",
                travelMedium: "flight"
            })
        });
        const text = await res.text();
        console.log("Status:", res.status);
        // Print first 500 chars to check for "Rajiv Gandhi Park" or similar
        console.log("Response:", text.slice(0, 2000));
    } catch (e) {
        console.error(e);
    }
}
run();
