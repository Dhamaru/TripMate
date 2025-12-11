
import { spawn } from 'child_process';
import fetch from 'node-fetch';

const server = spawn('npm.cmd', ['run', 'dev'], {
    cwd: process.cwd(),
    shell: true,
    env: { ...process.env, FORCE_COLOR: 'true' }
});

import fs from 'fs';

const logFile = 'debug_output.log';
// Clear file
fs.writeFileSync(logFile, '');

server.stdout.on('data', (data) => {
    const msg = `[SERVER]: ${data.toString().trim()}`;
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
});

server.stderr.on('data', (data) => {
    const msg = `[SERVER ERR]: ${data.toString().trim()}`;
    console.error(msg);
    fs.appendFileSync(logFile, msg + '\n');
});

// Trigger after 10 seconds
setTimeout(async () => {
    console.log("Triggering verification request...");
    try {
        const res = await fetch('http://localhost:5000/api/v1/trips/generate-itinerary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destination: "VijayawadaUnique" + Date.now(),
                days: 3,
                persons: 1,
                budget: 50000,
                typeOfTrip: "relaxed",
                travelMedium: "flight"
            })
        });
        const text = await res.text();
        console.log(`Response Status: ${res.status}`);
        console.log(`Response Body Preview: ${text.slice(0, 500)}`);
    } catch (e: any) {
        console.error("Fetch Error:", e.message);
    }

    // Kill server after test
    setTimeout(() => {
        console.log("Killing server...");
        spawn("taskkill", ["/pid", server.pid.toString(), "/f", "/t"]);
        process.exit(0);
    }, 5000);

}, 10000);
