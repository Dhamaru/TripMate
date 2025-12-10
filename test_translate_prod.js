
async function test() {
    try {
        const res = await fetch('https://tripmate-ylt6.onrender.com/api/v1/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: "Namaste",
                sourceLang: "hi",
                targetLang: "en"
            })
        });
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
