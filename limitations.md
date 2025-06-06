## Actual Problems / Limitations:

1. If the cursor was placed at the end of some lines (looks like the cursor has to be placed at the same X value of the tab position in the window) in the env file and the tab is switched, and then switched back again to the .env file, that particular secret in that particular line gets exposed.
2. On startup, it takes a good 3-5 seconds before the extension kicks in and masks the secrets. This is dreadful if the editor had an .env file open when it was closed.
3. On tab switch the secrets get exposed for a split second.
4. The switch between masked and unmasked isnt the greatest. I should be able to click anywhere on the actual value (not the key, which is currently also the case so its fine).
   Currently only clicks at around the end of the value length is being recognized
