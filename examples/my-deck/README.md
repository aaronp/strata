# My deck

**[▶ Present the deck](https://aaronp.github.io/my-deck/)**

The slides live in [`deck.md`](deck.md), with layout, styles and background in
[`deck-layout.json`](deck-layout.json). The app comes from
[aaronp/strata](https://github.com/aaronp/strata).

## Using this as a template

1. Create an empty repo on GitHub, then from this directory run
   `make clone REPO=you/your-repo` (or `./clone.sh`, which prompts).
   It copies the files to `../your-repo`, points the Present link above at
   your Pages site and sets the git remote.
2. Edit `deck.md`, or open it in Strata (drop the `.md` and `-layout.json` on
   [the app](https://aaronp.github.io/strata/), change it in build mode and **Download**),
   then commit and push.
3. On GitHub: Settings → Pages → Source: **GitHub Actions**.
4. Optional: on the repo page, open About (⚙) → tick **Use your GitHub Pages
   website** so the link also shows in the sidebar.

The workflow deploys from `main` or `master`. "Branch … is not allowed to
deploy to github-pages"? Add your branch under Settings → Environments →
github-pages → Deployment branches and tags.

Your site redirects to Strata with `?src=` pointing at your `deck.md`. Any
query params you add are passed on, e.g. `?slide=detail`.

No Pages? Link straight to the file:
`https://aaronp.github.io/strata/?src=https://github.com/<you>/<repo>/blob/<branch>/deck.md`
