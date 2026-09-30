from flask import Flask, render_template, request, jsonify, send_file
from pathlib import Path
import uuid
import traceback
from registration import register

BASE = Path(__file__).parent
UPLOAD = BASE / "uploads"
OUTPUT = BASE / "outputs"
UPLOAD.mkdir(exist_ok=True)
OUTPUT.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024  # 300 MB per request


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/register")
def run_registration():
    # Frontend: "Moving image" -> source, "Fixed image" -> reference
    s = request.files.get("source")
    r = request.files.get("reference")
    if not s or not r:
        return jsonify(success=False, error="Upload both images."), 400
    job = uuid.uuid4().hex
    sp = UPLOAD / f"{job}_source"
    rp = UPLOAD / f"{job}_reference"
    s.save(sp)
    r.save(rp)
    try:
        result = register(sp, rp, OUTPUT, job)
    except Exception as e:  # keep the API JSON-only so the UI can show the message
        traceback.print_exc()
        return jsonify(success=False, error=f"Registration failed: {e}"), 500
    return jsonify(result), (200 if result["success"] else 400)


@app.get("/file/<name>")
def get_file(name):
    p = OUTPUT / Path(name).name
    if not p.exists():
        return "Not found", 404
    return send_file(p, as_attachment=request.args.get("download") == "1")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
