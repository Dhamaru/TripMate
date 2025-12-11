
import 'dotenv/config';
console.log("GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY ? "LOADED: " + process.env.GOOGLE_API_KEY.slice(0, 5) + "..." : "NOT LOADED");
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "LOADED" : "NOT LOADED");
console.log("PORT:", process.env.PORT);
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "LOADED" : "NOT LOADED");
