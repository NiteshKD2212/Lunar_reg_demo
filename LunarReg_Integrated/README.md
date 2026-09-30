# LunarReg — Time for Moon (integrated)

Chandrayaan-2 → LROC image registration. Flask backend (SIFT + MAGSAC homography,
sub-pixel refinement, Lanczos warp, metrics) serving the LunarReg frontend.

## Run
```
cd LunarReg_Integrated
python -m venv .venv
# Windows:  .venv\Scripts\activate      macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5000

## How the two halves connect
| Frontend            | Backend field | Meaning                                   |
|---------------------|---------------|-------------------------------------------|
| Fixed image         | `reference`   | Target frame (stays put)                  |
| Moving image        | `source`      | Image that gets warped onto the fixed one |

`POST /register` returns metrics, inlier points, and URLs (`/file/<name>`) for the
registered image, overlay and correspondence plot. The dashboard renders these live.

## Live vs. demo
Live from the backend: registered image, overlay, correspondences, all metrics,
error heatmap, spatial-uniformity plot, PNG download.
Still static demo content (no backend for these yet, marked "Demo data" in the UI):
IIRS measurements, wavelength–reflectance graph, landing suitability.

## Notes
- Use small crops; don't upload the ~913 MB OHRC product directly.
- Fonts and Font Awesome load from CDNs, so the browser needs internet access.
- `uploads/` and `outputs/` fill up over time; delete old files whenever you like.
