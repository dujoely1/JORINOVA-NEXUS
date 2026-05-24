from dotenv import load_dotenv
import os

# Loads environment variables from a .env file.
# By default, python-doten v looks for a .env in the current working directory.
# If you run this script from backend/, it will pick backend/.env automatically.
load_dotenv()

print(os.getenv("ANTHROPIC_API_KEY"))

