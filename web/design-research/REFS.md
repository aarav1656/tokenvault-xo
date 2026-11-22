# Reference research: TokenVault XO web demo

Product job: a judge opens one page, sees a vault that pays out tokens by block height, checks every transaction against the chain, and runs the XO template's own scripts. Captures taken with refshot.py in the deepsurge profile, 1440 by 900. Hedgey docs returned a Cloudflare 1014 error page and chaingraph returned a bot challenge, so both were dropped and replaced by Blockchair and Sablier docs.

## blaze.xo.cash (the debug tool this page hands off to)

Screenshot: refs/blaze-1440.png, tokens: refs/blaze-1440.tokens.json. This is the XO Home screen a judge lands on after clicking out of our page: a 84px icon rail on the left, a balance block, five round action buttons in one row (Receive, Send, Create Invitation, Join Invitation, Import Template), then an Invitations list with an empty state. Measured: body background rgb(11, 13, 18), Inter 16px on 24px leading, secondary text 13px on 19.5px leading in rgb(161, 169, 185), panel radius 12px, warning banner 39px tall.
Steal: the exact verbs. Our three step guide uses the labels judges will see in blaze: Import Template, then Join Invitation or Inspect Transaction, so the hand-off needs no translation. Steal the density: small caps section labels (INVITATIONS) over a calm list.
Do not take: the dark rounded panels, the 12px radii and the empty state. Our sheet is light, ruled, zero radius, and never shows an empty state because the data is read before paint.

## bchblaze.cash (the hackathon's own front door)

Screenshot: refs/bchblaze-1440.png. The event site every judge has open in another tab. Measured: h2 Anton 52px on 46.8px leading, uppercase, tracking -0.26px; h3 Anton 20px; body Barlow 16px on 24.8px; lead paragraph 20px on 30px; stat trio under the hero (8 days, 3 workshops, prize figure) as large numerals over 12px letter-spaced caps labels; accent orange rgb(242, 106, 27) on a rgb(10, 5, 5) ground.
Steal: the stat trio shape, big numerals with one caps label each, used for our locked, released and releases figures, plus the four-steps band that numbers a process.
Do not take: the photographic fire hero, skewed italic headings, glow. A product page that looks like the event page reads as a skin, not as proof.

## sablier.com (token vesting and streaming, the nearest direct category)

Screenshot: refs/sablier-1440.png, tokens: refs/sablier-1440.tokens.json. Vesting by block time, the same job as this vault. Measured: h1 Urbanist 700 at 72px on 99px leading, ground rgb(26, 29, 40), lead copy 20px on 28px in rgb(165, 174, 192), nav link 16px weight 600, primary button 56px tall. A strip at the bottom of the first screen carries real onchain counts (914,000+ Transactions, 439,000+ Addresses) as proof.
Steal: onchain counts in the first screen as the proof strip. Ours is stronger: counts we compute in the browser from the transactions themselves.
Do not take: the 3D hourglass and coin renders, the navy ground, the pill orange CTA. Vesting products show a schedule as a decoration; ours draws the schedule as the data.

## blockchair.com Bitcoin Cash transaction page (what a judge compares our rows against)

Screenshot: refs/blockchair-1440.png, tokens: refs/blockchair-1440.tokens.json. Opened for our own mint transaction. Measured: h1 Golos Text 43.5px on 52.2px leading weight 600, the transaction hash set in Roboto Mono about 20px with three 40px square icon buttons (copy, share, pdf) beside it, a label over value pair TRANSACTION STATUS over Pending confirmations, ground rgb(12, 13, 19), content padding 40px.
Steal: hash plus copy button as one unit, status as label over a plain word, and monospace for every id. Our txid cells link to the explorer and carry copy buttons.
Do not take: sponsored chips above the title, the rounded pill nav, the gray panel stack.

## docs.sablier.com (negative: the generic card grid)

Screenshot: refs/sablierdocs-1440.png, also in negative/. Six equal cards in a 3 by 2 grid, each 308px wide with a 56px icon tile above the heading and a glow ring behind. h1 Urbanist 69.33px centred. This is the template every docs site shares, and the tell this page avoids: sections here are ruled cells on a visible 12 column grid with a constructed object each, never equal cards.
Steal: nothing. Kept as the measured counter example.

## ourworldindata.org life expectancy chart (outside the domain: a line chart that labels every axis)

Screenshot: refs/owid-1440.png, tokens: refs/owid-1440.tokens.json. The shape of the problem is "a quantity that changes over time with a source". Measured: chart title Playfair Display 25px on 30px leading, section label Lato 12px weight 900 tracking 1.2px in rgb(118, 118, 118), body Lato 16px on 25.6px, axis labels 13px with units written out (80 years, 70 years), thin 1px dotted gridlines, a data source line under the chart, a Download / Share button row of 36px height.
Steal: every axis label carries its unit and the source is printed under the figure. Our step chart prints "tokens" on the y axis, "block height" on the x axis, and a source line that names the Electrum server that answered.
Do not take: the navy masthead, the Playfair serif, the legend list with country colours. One series, one ink.

## cashscript.org (the original contract language, what the migrated panel quotes)

Screenshot: refs/cashscript-1440.png, tokens: refs/cashscript-1440.tokens.json. Measured: h1 system-ui 32px on 40px leading weight 700, h2 24px on 30px, body 16px on 26.4px in rgb(28, 30, 33), the four feature blocks are plain heading plus paragraph pairs in two columns with no card and no icon, buttons 48px tall radius 4px, footer donation address set at 16px.
Steal: the two column heading-paragraph pairs with no container: exactly how our migrated panel sets original source against the XO action list. Names judges recognise: TypeScript SDK, Electrum network provider (the same Electrum our readback uses).
Do not take: system-ui as a face, the green and blue filled buttons, the grey footer slab.

## cashtokens.org (the token standard under the vault)

Screenshot: refs/cashtokens-1440.png, tokens: refs/cashtokens-1440.tokens.json. Measured: h1 system-ui 48px on 60px weight 700 centred on a flat mint ground, three centred feature columns of 24px/39.6px lead copy over a rgb(28, 30, 33) band, footer link columns with 32px row spacing, buttons radius 6.4px.
Steal: a plain statement of what the thing is in the first band, then three short columns. Our hero states the claim in one sentence the same way, left aligned.
Do not take: the centred hero, the mint flood, the three equal centred columns (the generic trio). Our three figures sit on ruled cells and carry computed numbers.

## llamapay.io (direct competitor: streamed vesting payments)

Screenshot: refs/llamapay-1440.png, tokens: refs/llamapay-1440.tokens.json. Measured: h1 48px on 56px weight 700 white on rgb(29, 29, 29), lead 20px on 28px, a wall of 8 logos in two rows, a 420px by 44px primary button radius 8px, isometric illustration filling the right 700px.
Steal: nothing structural. It shows the category habit: an illustration where the schedule should be, and a logo wall as proof. Parity note: they show no schedule at all on the first screen; ours draws the full schedule from chain data.
Do not take: isometric illustration, logo wall, the soft grey and mint palette.

## unvest.io (direct competitor: vesting dashboards)

Screenshot: refs/unvest-1440.png, tokens: refs/unvest-1440.tokens.json. Measured: h1 Inter 75px on 75px weight 600 centred, lead 16px on 26px at 60 percent white, two buttons 48px tall radius 8px, a pill row of supported chain icons, a blue radial glow behind the headline, and a hand-drawn browser frame with traffic-light dots 56px tall starting at y 706.
Steal: the app screenshot sits below the fold and shows a vesting schedule table: confirms judges expect a schedule view.
Do not take: the glow, the centred Inter headline, the fake browser chrome. We show the real tool by linking to blaze.xo.cash.

**Steal list**

- blaze.xo.cash -> action verbs Import Template / Join Invitation / Inspect -> the three step hand-off band in the proof section.
- bchblaze.cash -> numeral over 12px caps label trio -> hero figures (locked, released, releases) computed from the chain.
- sablier.com -> onchain counts as the first-screen proof -> hero status line that fills from the live readback.
- blockchair -> hash with inline copy, label over value status -> txid cells and the confirmed / mempool state.

**Visual thesis**

A ruled Swiss sheet where the vault is drawn as data: one ultramarine stepped line falls from 60 to 0 across a block-height rail with halving ticks, and every figure under it is read from the chain.
