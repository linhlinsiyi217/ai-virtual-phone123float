REVERT 697f3e5: styles/bookstore.css was accidentally truncated from 8900+ lines to 175 lines.

This commit restores the full CSS file from e0a2180 (parent of 697f3e5).

Root cause: Using append=true actually overwrote the entire file instead of appending.

Recovery: git revert 697f3e5 OR git checkout e0a2180 -- styles/bookstore.css
