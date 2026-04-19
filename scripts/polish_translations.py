import json
import urllib.request
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor

FILE_PATH = 'out/workouts/locales/metadata/2026-04-02T13-52-51-213Z.json'
MODEL = 'gemma4:e4b'
MAX_THREADS = 5
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
            # FIX: ensure_ascii=False ensures UTF-8 characters like 'ü' are sent as-is, not escaped.
            # This often fixes issues with models not handling \uXXXX escapes correctly.
            payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
            req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
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

def process_entry(task_id, note, data, system_base):
    # source for polishing/translating (prefer 'original' if it exists and is valid)
    source = note.get('original') or note.get('de', '')
    if not source:
        return

    changed = False

    # 1. Polish DE
    de_curr = note.get('de', '')
    # Heuristic for mangled text: if source has 'ü' but current de doesn't (and doesn't have 'ue')
    is_mangled = 'ü' in source and 'ü' not in de_curr and 'ue' not in de_curr
    
    # We polish if:
    # - de is missing
    # - or it doesn't have double newlines (indicating it's not yet polished)
    # - or it appears mangled (missing umlauts)
    if not de_curr or "\n\n" not in de_curr or is_mangled:
        print(f"[{task_id}] Polishing DE...")
        prompt_de = f"Polish this German text. Fix punctuation. Use \\n\\n for paragraphs. CRITICAL: Ensure all German umlauts (ä, ö, ü) and sharp s (ß) are preserved correctly. Do not replace them with ae, oe, ue, ss unless they were already like that in the source.\\n\\nText:\\n{source}"
        res = call_ollama_chat(system_base, prompt_de)
        if res: 
            note['de'] = res
            changed = True
            print(f"[{task_id}] DE done.")

    # 2. Other languages
    lang_names = {
        'en': 'English',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh-CN': 'Simplified Chinese'
    }
    
    for lang, lang_name in lang_names.items():
        if not note.get(lang):
            print(f"[{task_id}] Polishing {lang}...")
            # Use polished German as reference
            ref_de = note.get('de', source)
            prompt = f"Translate/Polish to {lang_name}. Use \\n\\n for paragraphs. Reference German:\\n{ref_de}"
            res = call_ollama_chat(system_base, prompt)
            if res:
                note[lang] = res
                changed = True
                print(f"[{task_id}] {lang} done.")

    if changed:
        # Atomic write back
        with file_lock:
            print(f"[{task_id}] Saving...")
            with open(FILE_PATH, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

def process():
    if not os.path.exists(FILE_PATH):
        print(f"File not found: {FILE_PATH}")
        return

    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    system_base = "You are a professional translator and editor. Your task is to produce native-sounding, polished text. ALWAYS use double newlines (\\n\\n) to separate paragraphs. Ensure punctuation is perfect. Output ONLY the final text without any preamble, thinking process, or explanation."

    tasks = []
    
    # ADOPT NEW SCHEMA: handle 'pages' and 'entries'
    
    # Process pages (e.g., CAU category pages)
    if "pages" in data:
        for page_id, providers in data["pages"].items():
            for provider_name, provider_entry in providers.items():
                notes = provider_entry.get('notes')
                if isinstance(notes, dict):
                    tasks.append((f"page:{page_id}:{provider_name}", notes))
    
    # Process entries (flattened workout-specific entries)
    if "entries" in data:
        for workout_id, fields in data["entries"].items():
            for field_name, entry in fields.items():
                if isinstance(entry, dict) and ('digest' in entry or 'de' in entry):
                    tasks.append((f"entry:{workout_id}:{field_name}", entry))

    if not tasks:
        print("No tasks found to process.")
        return

    print(f"Found {len(tasks)} items to check. Resuming processing with {MAX_THREADS} threads...")
    with ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:
        for task_id, note in tasks:
            executor.submit(process_entry, task_id, note, data, system_base)

if __name__ == "__main__":
    process()
