"""
Test Geocoding API directly to diagnose the issue
"""
import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key
api_key = os.getenv('GOOGLE_API_KEY')

if not api_key:
    print("ERROR: GOOGLE_API_KEY not found in .env file")
    exit(1)

print(f"API Key: {api_key[:20]}...")

# Test Geocoding API
city = "Mumbai"
url = f"https://maps.googleapis.com/maps/api/geocode/json?address={city}&key={api_key}"

print(f"\nTesting Geocoding API for: {city}")
print(f"URL: {url[:80]}...")

try:
    response = requests.get(url, timeout=10)
    print(f"\nHTTP Status: {response.status_code}")
    
    data = response.json()
    print(f"API Status: {data.get('status')}")
    
    if data.get('status') == 'REQUEST_DENIED':
        print(f"ERROR: {data.get('error_message')}")
        print("\nPossible causes:")
        print("1. Geocoding API not enabled in Google Cloud Console")
        print("2. API key restrictions don't include Geocoding API")
        print("3. Billing not enabled")
    elif data.get('status') == 'OK':
        results = data.get('results', [])
        print(f"Results found: {len(results)}")
        if results:
            location = results[0]['geometry']['location']
            print(f"Coordinates: {location['lat']}, {location['lng']}")
            print("SUCCESS: Geocoding API is working!")
    else:
        print(f"Unexpected status: {data.get('status')}")
        print(f"Full response: {data}")
        
except Exception as e:
    print(f"Exception: {e}")
