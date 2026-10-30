# QAR Budget

A simple budget tracker for people living in Qatar. Write down what comes in and what goes out in Qatari riyals, see where the month's money went, and set a monthly limit for the categories you care about. It works in English and Arabic, on a phone or a laptop.

There is no account and no server. Everything is saved in your own browser.

![QAR Budget in English on a laptop](docs/screenshot.png)

<img src="docs/screenshot-ar.png" alt="QAR Budget in Arabic, dark mode, on a phone" width="320">

## Features

- Add income and expenses with an amount in QAR, a category, a date and an optional note. Edit or delete them later; a delete can be undone.
- A monthly view with income, spending and balance, how this month's spending compares with last month, and a bar chart of spending by category. Use the arrows to move between months.
- A monthly budget per category with progress bars. A category close to its limit (80% or more) or over it gets a warning with an icon and text, not only a color.
- Categories that fit life in Qatar, such as rent, money sent home, transport and fuel, and bills and phone.
- English and Arabic, with a right-to-left layout for Arabic. Amounts are formatted with `Intl.NumberFormat` for `en-QA` and `ar-QA`, so the Arabic screen shows Arabic digits and ر.ق. Amount fields accept Arabic digits as well, so typing ١٢٥٫٥ works.
- Light and dark mode. It follows your system setting until you choose one.
- Export a JSON backup or a CSV file, and import either one back. Importing skips entries you already have, so importing the same file twice does not create duplicates.
- Data is stored in `localStorage` with a schema version. Data saved by an older version is upgraded when the app loads, and anything that cannot be read is copied to a backup key instead of being thrown away.

## Run it locally

You need Node.js 22.12 or newer. Node 20 also works from 20.19 on.

```bash
npm install
npm run dev
```

Then open the address Vite prints, usually http://localhost:5173/qar-budget/.

To try it with some data, use "Import file" and pick `examples/sample.csv`. It has made-up entries for September and October 2026.

For a production build:

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test
```

All the logic lives in plain TypeScript modules in `src/lib` that do not touch the DOM, so Vitest tests them directly: amount parsing and formatting, monthly totals, budgets, reading and writing CSV, merging imports, and the storage migrations. The code in `src/ui` only turns that into HTML and SVG.

`npm run build` also runs the TypeScript compiler in strict mode.

## CSV format

```csv
date,type,category,amount,note
2026-10-01,income,salary,14500.00,October salary
2026-10-05,expense,groceries,412.30,Weekly shop
```

- `date` is `YYYY-MM-DD`.
- `type` is `income` or `expense`.
- `category` is one of these ids. Income: `salary`, `allowance`, `freelance`, `other-income`. Expenses: `housing`, `groceries`, `dining`, `transport`, `bills`, `remittance`, `health`, `education`, `shopping`, `entertainment`, `travel`, `other-expense`. Other ids are kept and shown as they are.
- `amount` is a positive number with up to two decimals.
- The order of the columns does not matter and extra columns are ignored. Rows with a problem are skipped and listed by line number after the import.

Exported CSV files start with a byte order mark so Excel opens Arabic notes correctly. Notes that start with `=`, `+`, `-` or `@` get a leading apostrophe so a spreadsheet does not run them as formulas; the import removes it again.

## Project layout

```
src/lib    budget logic, storage and file formats, with tests next to each module
src/ui     the views: form, list, chart, budgets, import and export
src/main.ts
examples/  a sample CSV file
```

## Deploying

`vite.config.ts` sets `base` to `/qar-budget/`, so the `dist` folder from `npm run build` can be published to GitHub Pages for a repository named `qar-budget`.

## License

MIT. See [LICENSE](LICENSE).
