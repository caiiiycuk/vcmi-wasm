import os
import json
from shutil import rmtree, copy
from glob import glob

def merge_session_data():
    sessions_dir = os.path.join('scripts', 'sessions')
    merged_data = {}
    
    # Check if directory exists
    if not os.path.exists(sessions_dir):
        print(f"Warning: {sessions_dir} directory not found")
        return merged_data

    # Read and merge all JSON files
    for filename in os.listdir(sessions_dir):
        if filename.endswith('.json'):
            file_path = os.path.join(sessions_dir, filename)
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    for key, value in data.items():
                        if key in merged_data:
                            for file, cnt in value.items():
                                if file in merged_data[key]:
                                    merged_data[key][file] += cnt
                                else:
                                    merged_data[key][file] = cnt
                        else:
                            merged_data[key] = value
            except json.JSONDecodeError as e:
                print(f"Error reading {filename}: {e}")
            except Exception as e:
                print(f"Unexpected error reading {filename}: {e}")
                
    return merged_data

# Get merged session data
session_data = merge_session_data()

sourcedir = "/home/caiiiycuk/vcmi/data/data-ru"
outdir = "/home/caiiiycuk/vcmi/data/demo-ru"

rmtree(outdir, ignore_errors=True)
os.makedirs(outdir)

print(session_data.keys())

def either(c):
    return '[%s%s]' % (c.lower(), c.upper()) if c.isalpha() else c

for key in session_data.keys():
    once = True
    name = os.path.basename(key)
    root = os.path.join(sourcedir, name)
    if not os.path.exists(root):
        print(f"Warning: Source path {root} not found")
        continue
    
    for file in session_data[key].keys():
        resource = os.path.basename(file)
        pattern = ''.join(map(either, resource))

        files = glob(pattern + ".*", root_dir=root)

        if once:
            files += glob("DEFAULT=*", root_dir=root)
            files += glob("C*.*", root_dir=root)
            # heroes portraits
            files += glob("HP*.bmp", root_dir=root)
            once = False

        if len(files) == 0:
            print(f"Warning: File {file} not found")
        else:
            os.makedirs(os.path.join(outdir, name), exist_ok=True)
            for f in files:
                copy(os.path.join(root, f), os.path.join(outdir, name, os.path.basename(f)))
