-- Add cell_w_px so the alignment editor can handle non-square grid cells.
-- Maps converted from PDFs often have slightly different horizontal vs vertical
-- pixel-per-square ratios. cell_px remains the vertical (row height) reference;
-- cell_w_px is the horizontal (column width). NULL means "same as cell_px".
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS cell_w_px INTEGER;
