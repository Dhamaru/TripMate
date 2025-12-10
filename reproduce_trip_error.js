
const fetch = require('node-fetch');

async function testTripCreation() {
    try {
        // 1. Need to login first to get a cookie/session (Authentication is likely required)
        // For this simple script, it might be hard to simulate a full auth flow if the app uses complex cookies.
        // However, I can try to hit the endpoint and at least see if I get 401 (Unauthorized) or 500/400.
        // If I get 401, it means the route exists and is protected.

        const res = await fetch('http://localhost:5000/api/v1/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destination: "Tokyo",
                startDate: "2023-12-25",
                endDate: "2024-01-01",
                budget: 5000,
                currency: "USD"
            })
        });

        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response:", text);

    } catch (e) {
        console.error(e);
    }
}

testTripCreation();
