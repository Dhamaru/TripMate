# TripMate 🌍✈️

TripMate is your all-in-one AI-powered travel companion designed to make your journeys seamless and memorable. From planning personalized itineraries to tracking your travel memories, TripMate has you covered.

## ✨ Key Features

### 🗺️ Smart Trip Planner
- **AI-Generated Itineraries**: Create personalized travel plans based on your interests, budget, and duration.
- **Interactive Maps**: Visualize your trip with integrated maps and route planning.
- **Customizable Plans**: Edit and refine your itinerary to fit your schedule.

### 📝 Travel Journal
- **Digital Diary**: Document your experiences, thoughts, and memories in a beautiful digital journal.
- **Rich Media**: Attach photos and location tags to your entries.
- **Timeline View**: Relive your trips chronologically.

### 🧳 Smart Packing List
- **AI Suggestions**: Get packing recommendations based on your destination, weather, and activities.
- **Checklists**: Keep track of what you've packed and what's missing.

### 🛠️ Travel Tools
- **☀️ Weather Insights**: Real-time weather forecasts for your destinations to help you pack right.
- **💱 Currency Converter**: Instant currency conversion rates for hassle-free shopping and budgeting.
- **🆘 Emergency Services**: Quickly locate nearby hospitals, police stations, and embassies.
- **🗣️ Translator**: Break language barriers with an integrated translation tool.
- **🗺️ Offline Maps**: Access essential map data even without an internet connection.

### 👤 User Profile
- **Trip History**: Access all your past and upcoming trips in one place.
- **Personal Preferences**: Save your travel preferences for better recommendations.
- **Secure Authentication**: Sign up and sign in securely to keep your data safe.

## 🚀 Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express
- **Database**: MongoDB (via Mongoose)
- **AI**: OpenAI API (for trip generation and suggestions)
- **Maps**: Leaflet / Google Maps API
- **Authentication**: Passport.js

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v20+)
- Docker (optional, for containerized deployment)

### Local Development

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Dhamaru/TripMate.git
    cd TripMate
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Set up environment variables**
    Create a `.env` file in the root directory and add your API keys:
    ```env
    OPENAI_API_KEY=your_openai_api_key
    DATABASE_URL=your_mongodb_connection_string
    SESSION_SECRET=your_session_secret
    ```

4.  **Run the development server**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5000`.

### 🐳 Docker Deployment

1.  **Build the Docker image**
    ```bash
    docker build -t tripmate .
    ```

2.  **Run the container**
    ```bash
    docker-compose up
    ```
    Access the app at `http://localhost:5000`.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.
