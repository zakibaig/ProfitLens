# ProfitLens

ProfitLens is a local dashboard application with separate Fixed Projects and All Projects dashboards.

## Run locally

```bat
npm run dev
```

Or run:

```bat
start.bat
```

## GitHub workflow

After making changes locally:

```bat
git add .
git commit -m "ProfitLens update"
git push
```

## Data files

Keep Excel files local in the `data` folder. They are ignored by Git by default.

## Cache files

Runtime cache files are also ignored by Git and regenerated locally.
