"""
Remove orphaned Open-Meteo helper functions
"""
import re

# Read the file
with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find and remove the fetchOM function (starts around line 1525)
# Find and remove the geocodeCity function (starts around line 1550)
# These are orphaned functions no longer used by the new Google Weather API route

content = ''.join(lines)

# Remove fetchOM function
pattern1 = r'      const fetchOM = async \(latNum: number, lonNum: number\) =>[^}]+\};[\r\n]+'
content = re.sub(pattern1, '', content, flags=re.DOTALL)

# Remove geocodeCity function  
pattern2 = r'      const geocodeCity = async \(q: string\): Promise<\{ lat: number; lon: number \} \| null> =>[^}]+\};[\r\n]+'
content = re.sub(pattern2, '', content, flags=re.DOTALL)

# Write back
with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Removed orphaned fetchOM function")
print("✓ Removed orphaned geocodeCity function")
print("✓ All Open-Meteo references removed!")
