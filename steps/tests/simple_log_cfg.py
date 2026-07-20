import re
import tkinter as tk
from tkinter import filedialog
import os

def extract_radar_config(log_file_path, output_file_path=None):
    """
    Extract radar configuration commands from log file.

    Args:
        log_file_path (str): Path to input log file
        output_file_path (str, optional): Path to save extracted config
    """

    # Pattern to match required lines
    pattern = re.compile(r'INFO\s+-\s+radar_tracker\.console_logger\s+-\s+>\s+(.*)')

    extracted_commands = []

    with open(log_file_path, 'r') as file:
        for line in file:
            match = pattern.search(line)
            if match:
                command = match.group(1).strip()
                extracted_commands.append(command)

    # Output handling
    if output_file_path:
        with open(output_file_path, 'w') as out_file:
            for cmd in extracted_commands:
                out_file.write(cmd + '\n')
        print(f"[INFO] Extracted config saved to: {output_file_path}")
    else:
        print("\n--- Extracted Radar Config ---\n")
        for cmd in extracted_commands:
            print(cmd)

    return extracted_commands


# Example usage
if __name__ == "__main__":
    # Create and hide root tkinter window
    root = tk.Tk()
    root.withdraw()

    # Allow user to select a .log file
    log_file = filedialog.askopenfilename(
        title="Select Log File",
        filetypes=[("Log Files", "*.log"), ("Text Files", "*.txt"), ("All Files", "*.*")]
    )

    if log_file:
        # Generate output file name (e.g., myscript.log -> myscript.cfg)
        base_name = os.path.splitext(log_file)[0]
        output_file = f"{base_name}.cfg"

        extract_radar_config(log_file, output_file)
        print(f"[INFO] Processing complete for {log_file}")
    else:
        print("[INFO] No file selected.")