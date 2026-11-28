# Testing before merging

Everything below runs on your own computer. Work on the newest branch: it contains all the others.

```sh
cd portfolio
git fetch origin
git checkout feat/account-recovery
```

## 1. One-time setup

```sh
cp .env.example .env            # then set DJANGO_SECRET_KEY to any long random text
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
npm --prefix frontend install
npm --prefix admin install
```

## 2. Automated checks (do these first)

Run from the `backend/` folder:

```sh
cd backend
.venv/bin/python manage.py makemigrations --check --dry-run   # A
.venv/bin/python manage.py migrate                            # B
.venv/bin/python manage.py test gallery                       # C
.venv/bin/python -m pytest gallery/tests/test_processing.py   # D
cd ..
npm --prefix frontend run build                               # E
npm --prefix admin run build                                  # F
```

| Check | Passes when | If it fails |
|---|---|---|
| A | It prints `No changes detected` | The hand-written migrations don't match the models. Send Claude the output. |
| B | It ends with `OK` lines | Send the error. |
| C | It ends with `OK` | Send the failing test names and tracebacks. |
| D | It ends with `22 passed` | Send the output. |
| E, F | `dist/` is built with no errors | Send the TypeScript or Vite errors. |

## 3. Run everything locally

Use three terminals.

```sh
# 1: API (create the account once)
backend/.venv/bin/python backend/manage.py create_photographer ziyue --display-name "Ziyue" --slug ziyue
backend/.venv/bin/python backend/manage.py runserver

# 2: public site → http://localhost:5173
npm --prefix frontend run dev

# 3: dashboard → http://localhost:5174
npm --prefix admin run dev
```

`create_photographer` asks for a password and then prints 10 recovery codes. Copy them somewhere; you'll use one in section 4.

Locally, files go to `backend/media/` instead of R2.

## 4. Manual checklist

Use a few real JPEGs: at least one portrait, one landscape, one straight off a phone, and one large file (20 MB or more).

**Dashboard: photos (PR #3, #4)**
- [ ] Sign in at http://localhost:5174.
- [ ] Projects tab: create a project and set architect, location, year and grid shape (try 3:4).
- [ ] Photos tab: select that project and drop several JPEGs. Each shows progress, then "Done". Files are uploaded one at a time.
- [ ] Drop a PNG or HEIC: it is refused with "Only JPEG files can be uploaded."
- [ ] A phone photo taken in portrait shows upright, not sideways.
- [ ] Open a photo: Publish is disabled until alt text is filled in. Fill it in and publish.
- [ ] Crop for grids: pick a ratio, drag the box, use the arrow keys and the size slider, then Save crop. The thumbnail updates. Remove crop puts the whole photo back.
- [ ] Drag photos to reorder them inside the project, then reload: the order is kept.
- [ ] Bulk: select several photos, then Publish, Move and Delete.
- [ ] Projects tab: reorder with ↑/↓, pick a cover, publish the project.
- [ ] Homepage tab: change the headline, upload a short MP4 and a JPEG poster.
- [ ] About you: fill in the story (leave a blank line between paragraphs), add links and a portrait.

**Public site (PR #2, #4)** at http://localhost:5173
- [ ] The hero video plays muted under the header. The pause button works. With "reduce motion" turned on in your OS, only the poster shows.
- [ ] Project covers are all the same shape and nothing is cut off (unless you cropped it to 3:4).
- [ ] The About section shows the portrait on the left and the story on the right. On a phone-width window they stack.
- [ ] A project page shows uniform cells in that project's grid shape, with each photo whole inside its cell.
- [ ] Clicking a photo opens the lightbox: ← → and Esc work, swiping works on a phone, and Info is open on desktop and closed on a phone.
- [ ] Draft photos and unpublished projects do not appear.
- [ ] Right-click a photo → Save image, then check its properties: there is no GPS or camera data in the saved file.

**Passwords (PR #5)**
- [ ] Sign out. Click "Forgot password?" and enter the username, one recovery code and a new password: you are signed in.
- [ ] Try the same code again: it is refused.
- [ ] About you → Change password works. Using the wrong current password shows an error.
- [ ] About you → Recovery codes shows "9 of 10 left". Make new codes: 10 new codes appear once, with Copy and Download buttons.
- [ ] Type the wrong password six times quickly on the sign-in page: the sixth attempt is refused (rate limit).

**Django maintenance admin**
- [ ] http://127.0.0.1:8000/backstage-maintenance/ opens (sign in with a `--staff` account).

## 5. Merge

When all checks pass, merge on GitHub in order: #1 → #2 → #3 → #4 → #5. Then deploy with `docs/deploy.md`.
