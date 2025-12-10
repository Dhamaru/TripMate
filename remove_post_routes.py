"""
Remove both POST /api/tools/weather routes that use old APIs
"""

# Read the file
with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the first POST weather route
first_route_start = content.find("  app.post('/api/tools/weather', isJwtAuthenticated, aiLimiter, async (req: any, res) => {")
if first_route_start == -1:
    print("ERROR: Could not find first POST weather route!")
    exit(1)

# Find the second POST weather route (test)
second_route_start = content.find("  app.post('/api/tools/weather/test'", first_route_start)
if second_route_start == -1:
    print("ERROR: Could not find second POST weather route!")
    exit(1)

# Find the trips/sync route (comes after both weather routes)
trips_sync_start = content.find("  app.post('/api/v1/trips/sync'", second_route_start)
if trips_sync_start == -1:
    print("ERROR: Could not find trips/sync route!")
    exit(1)

# Remove everything from first weather route to trips/sync route
before_routes = content[:first_route_start]
after_routes = content[trips_sync_start:]

# Combine
new_content = before_routes + after_routes

# Write back
with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✓ Removed POST /api/tools/weather route")
print("✓ Removed POST /api/tools/weather/test route")
print("✓ All Open-Meteo code removed!")
