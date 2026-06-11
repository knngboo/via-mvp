// ParseLogic for the Via plugin — this folder is the home for all of Via's
// data-parsing logic. The dashboard host calls `parse(files)` and passes the
// return value to the Via dashboard as its `data` prop.
//
// PLACEHOLDER — no parsing implemented yet, so this returns null and the
// dashboard just shows its placeholder.
//
// To build it out: read `files` (the uploaded CSVs — each has `.name` and
// `.csvData`, see getAllUploadedFiles in src/context/CsvContext.jsx) and return
// whatever shape Via's dashboard wants to visualize.
export function parse(files) {
  return null;
}
