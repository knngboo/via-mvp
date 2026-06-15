#!/bin/bash
# via-mvp Phase A Cleanup — Run this once from your Terminal
# Usage: bash cleanup_phase_a.sh
# All files listed here are CONFIRMED DEAD — zero imports, unreachable routes, or legacy clutter.

set -e
REPO="/Users/knngboo/OG/bfi-superman/via-mvp/frontend/src"

dead_files=(
  # A1 — Dead pages (never imported in App.jsx or any router)
  "pages/hub/QueuePage.jsx"
  "pages/hub/HubHome.jsx"
  "pages/hub/ClarificationPage.jsx"
  "pages/hub/SuccessPage.jsx"

  # A2 — Dead component cluster (self-referential island, nothing outside imports them)
  "components/CSVEditor.jsx"
  "components/CSVFeedbackForm.jsx"
  "components/ToggleSwitch.jsx"
  "components/AppLayout.jsx"
  "components/UploadInfo.jsx"
  "components/Profiles.jsx"
  "components/ProgressDots.jsx"
  "components/IndicatorChart.jsx"
  "components/GiveContextDrawer.jsx"
  "components/ResolveView.jsx"

  # A3 — Dead CSS files (companion styles for all dead components above)
  "styles/ClarificationPage.css"
  "styles/CSVEditor.css"
  "styles/CSVFeedbackForm.css"
  "styles/GiveContextDrawer.css"
  "styles/Home.css"
  "styles/IndicatorChart.css"
  "styles/Profiles.css"
  "styles/ProgressDots.css"
  "styles/ToggleSwitch.css"
  "styles/UploadInfo.css"
  "styles/AppLayout.css"
  "styles/ResolveView.css"
  "styles/SubmissionsPage.css"

  # A4 — macOS clutter
  ".DS_Store"
  "pages/.DS_Store"
  "context/.DS_Store"

  # A5 — Dead service (zero imports anywhere)
  "services/dataService.js"
)

echo ""
echo "================================================"
echo "  via-mvp Phase A Cleanup"
echo "================================================"
echo ""

deleted=0
skipped=0

for rel in "${dead_files[@]}"; do
  path="$REPO/$rel"
  if [ -f "$path" ]; then
    rm -f "$path"
    echo "  ✅ deleted: $rel"
    ((deleted++))
  else
    echo "  ⚠️  not found (already gone?): $rel"
    ((skipped++))
  fi
done

echo ""
echo "================================================"
echo "  Done: $deleted deleted, $skipped not found"
echo "================================================"
echo ""
echo "Next: run 'docker compose up' and verify the app"
echo "still loads — none of these files were reachable."
echo ""
