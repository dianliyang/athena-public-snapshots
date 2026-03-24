import json
import urllib.request
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor

FILE_PATH = 'out/workouts/locales/metadata/2026-03-22T18-55-20-500Z.json'
MODEL = 'qwen3.5:9b'
MAX_THREADS = 1  # Single thread as requested
file_lock = threading.Lock()

def call_ollama_chat(system_prompt, user_prompt, retries=3):
    url = "http://localhost:11434/api/chat"
    data = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False,
        "think": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 1000
        }
    }
    
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
            # Increased timeout to 5 minutes
            with urllib.request.urlopen(req, timeout=300) as response:
                result_json = json.loads(response.read().decode('utf-8'))
                result = result_json.get('message', {}).get('content', '').strip()
                return result
        except Exception as e:
            if attempt < retries - 1:
                print(f"Error (attempt {attempt+1}/{retries}), retrying...: {e}")
                time.sleep(5 * (attempt + 1))
            else:
                print(f"Final error calling Ollama: {e}")
    return None

def process_entry(workout_name, location_name, note, data, system_base):
    # Check if all fields already have double newlines
    langs = ['de', 'en', 'ja', 'ko', 'zh-CN']
    if all("\n\n" in (note.get(l, "") or "") for l in langs):
        print(f"[{workout_name}] Already processed, skipping.")
        return

    # 1. Polish DE
    de_orig = note.get('de', '')
    if de_orig and "\n\n" not in de_orig:
        print(f"[{workout_name}] Polishing DE...")
        prompt_de = f"Polish this German text. Fix punctuation. Use \\n\\n for paragraphs.\\n\\nText:\\n{de_orig}"
        res = call_ollama_chat(system_base, prompt_de)
        if res: note['de'] = res

    # 2. EN
    en_orig = note.get('en', '')
    if en_orig and "\n\n" not in en_orig:
        print(f"[{workout_name}] Polishing EN...")
        prompt_en = f"Translate/Polish to English. Use \\n\\n for paragraphs. Reference German:\\n{note['de']}\\n\\nExisting EN:\\n{en_orig}"
        res = call_ollama_chat(system_base, prompt_en)
        if res: 
            note['en'] = res
            print(f"[{workout_name}] EN done.")

    # 3. JA
    ja_orig = note.get('ja', '')
    if ja_orig and "\n\n" not in ja_orig:
        print(f"[{workout_name}] Polishing JA...")
        prompt_ja = f"Translate/Polish to Japanese. Use \\n\\n for paragraphs. Reference German:\\n{note['de']}\\n\\nExisting JA:\\n{ja_orig}"
        res = call_ollama_chat(system_base, prompt_ja)
        if res: 
            note['ja'] = res
            print(f"[{workout_name}] JA done.")

    # 4. KO
    ko_orig = note.get('ko', '')
    if ko_orig and "\n\n" not in ko_orig:
        print(f"[{workout_name}] Polishing KO...")
        prompt_ko = f"Translate/Polish to Korean. Use \\n\\n for paragraphs. Reference German:\\n{note['de']}\\n\\nExisting KO:\\n{ko_orig}"
        res = call_ollama_chat(system_base, prompt_ko)
        if res: 
            note['ko'] = res
            print(f"[{workout_name}] KO done.")

    # 5. ZH-CN
    zh_orig = note.get('zh-CN', '')
    if zh_orig and "\n\n" not in zh_orig:
        print(f"[{workout_name}] Polishing ZH-CN...")
        prompt_zh = f"Translate/Polish to Simplified Chinese. Use \\n\\n for paragraphs. Reference German:\\n{note['de']}\\n\\nExisting ZH:\\n{zh_orig}"
        res = call_ollama_chat(system_base, prompt_zh)
        if res: 
            note['zh-CN'] = res
            print(f"[{workout_name}] ZH-CN done.")

    # Atomic write back
    with file_lock:
        print(f"[{workout_name}] Saving...")
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

def process():
    if not os.path.exists(FILE_PATH):
        print(f"File not found: {FILE_PATH}")
        return

    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    pages = data.get('page', {})
    system_base = "You are a professional translator and editor. Your task is to produce native-sounding, polished text. ALWAYS use double newlines (\\n\\n) to separate paragraphs. Ensure punctuation is perfect (no spaces before periods/commas, correct punctuation for the target language). Output ONLY the final text without any preamble, thinking process, or explanation."

    tasks = []
    for workout_name, locations in pages.items():
        for location_name, entry in locations.items():
            note = entry.get('note')
            if note:
                tasks.append((workout_name, location_name, note))

    print(f"Resuming processing with {MAX_THREADS} threads...")
    with ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:
        for workout_name, location_name, note in tasks:
            executor.submit(process_entry, workout_name, location_name, note, data, system_base)

if __name__ == "__main__":
    process()
