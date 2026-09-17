# How to run a Tambiz event

A worksheet for the coordinator. Follow the parts in order. Each step is one action.
You do not need to remember anything from last year.

The whole job, in one line: **you upload one workbook, the judges score on their phones, and when judging is done you close the event and download two files.**

**What you need before you start**

- The app's web address (from Vercel, for example `https://tambiz.vercel.app`).
- Your coordinator email and password.
- One Excel workbook with two sheets, **Students** and **Judges** (Part C says exactly what goes in it; the app gives you an empty one to fill in).

**Try it on the practice event first.** The app comes with an event called **PRACTICE · Tambiz 2027**. Every name, group, score and email in it is invented, and every screen of it says **Practice event** in a yellow bar. Try every part of this guide on it, then create the real event. Never score a real group in the practice event.

If the app was set up before this version, its old sample event (called **Tambiz 2027**, with no yellow bar) is still there. On the **Events** page it shows **Sample data** and **Replace with fresh practice data**. Press it once, tick the box, and the old sample event, with its invented students, groups and scores, is replaced by the practice event. It is offered only for the sample event, never for an event you created.

**Words used here**

- **Event**: one year's Tambiz. Everything else belongs to an event.
- **Half**: Defense (70% of a group's overall score) or Booth (30%).
- **Sheet**: one judge's scores for one group in one half.
- **Submitted**: a sheet the judge finished with **Mark group complete**. Only submitted sheets count.

**The screens**

Each event has these tabs: **Data**, **Judges**, **Scoring sheet**, **Progress**, **Results**, **Judge profiles** and **Close the event**. Judges see only their own two screens: the list of groups, and the scoring sheet.

**How the tables work**

The Data table, the Judges table, a group's scores, Results and Individual grades are all the same table, and it works like Excel. Learn it once:

- Click a cell, or move to it with the arrow keys, and type. **Enter** goes down, **Tab** goes right (Shift+Tab left). **Esc** throws away what you typed in that cell. Tab past the very last cell leaves the table.
- **F2** or a double-click puts the cursor inside the cell's text, to change part of it.
- **To add a row, type in the empty last row.** It saves once its required cells are filled; until then the label says what it still needs.
- **To paste from Excel:** copy the cells in Excel, click the cell where the top-left one should go, and press **Ctrl+V** (⌘V on a Mac). A yellow bar says how many cells will change and how many rows will be added, and the new values are highlighted in the table. Press **Enter** to apply or **Esc** to cancel. Rows past the end become new rows.
- **Shift** with the arrow keys selects several cells. **Ctrl+C** copies them to paste into Excel; **Delete** empties them; one value pasted over a selection fills all of it.
- A cell with a list (a group, an adviser, Present or Absent) completes what you type, as Excel does. The rest of the best match appears in the cell, highlighted, so you can read what will be saved before you press a key: type `PAYONG P` and the cell shows PAYONG P**ALAY**. Keep typing to narrow it. **Down** shows the next match in the cell and **Up** the one before; the list under the cell shows the matches. **Enter** or **Tab** saves exactly what the cell shows, and only Enter or Tab accept a completion: clicking away or switching to another window or tab never saves one. **Esc** or **Backspace** removes the completion and keeps only what you typed (press **Esc** again to leave the cell unchanged). On the Data table, a **Group** or **Adviser** that is not on the list is taken as a new one: remove the completion, then press **Enter**.
- **Ctrl+Delete** removes the selected row, after you press **Enter** to confirm. **Ctrl+Enter** opens the row's link, for example a group's scores.
- **Ctrl+F** goes to the table's **Search** box, which finds any word in any column. The lists beside it filter by a column, for example Section or Adviser. Click a column heading to sort by it, again to reverse, a third time to go back.
- **There is no Save button.** Every change saves by itself. The label at the top right of the table says **All changes saved**, **Saving…**, or in red how many cells were not saved. A red cell was refused: select it and the reason shows under the table. Fix it by typing again.
- On a phone each row shows as a card, with **Sort** beside the filters. Tap a value to change it.

---

## Part A. Create the event

1. Open the app's web address on a laptop.
2. Type your coordinator email in **Email** and your password in **Password**, and press **Sign in**. You see the **Events** page.
3. Scroll to **Start a new event**.
4. Check the **Year** box shows the right year, for example `2027`. Change it if not.
5. Leave **Title** empty to call it "Tambiz 2027", or type another title.
6. Press **Create event**. You land on the event's **Data** tab.

The scoring sheet (categories, maximums and criterion wording) is copied from the newest event. A new event spells the second defense category **Infomercial**; an older event that stored "Informercial" keeps the spelling it was judged under.

☐ Done: the event exists and says **Open for judging**.

---

## Part B. Enter the criterion wording

Judges see this wording on their phones. Without it, the rows read "Criterion 1, Criterion 2…". You can do this at any time, even during judging: wording never changes a score.

1. Press the **Scoring sheet** tab.
2. Each category is a card with one box per criterion. The points for that criterion are printed beside its box, for example **/20**.
3. Type the wording into each box.
4. To paste the whole list instead: in Word or Excel, copy the criteria **one per line, in sheet order** (the 21 defense criteria, then the 18 booth criteria). Click the first box under **Elevator Pitch** and paste. Each line fills the next box, carrying on into the next category. Numbers and bullets at the start of a line are removed. The bar at the bottom says how many boxes were filled.
5. Check a few boxes against your list, especially the last box of each category.
6. Press **Save wording**. The green message says how many criteria have wording.
7. Judges see the new wording the next time they open a group.

A new event copies the wording from the newest event, so next year you only change what changed.

☐ Done: the green message says all 39 criteria have wording.

---

## Part C. Prepare and upload the workbook

Everything about the students, the groups, the advisers and the judges comes from one Excel workbook.

### Get the workbook

1. Press the **Data** tab.
2. Press **Download template**. It is an empty workbook with the right columns, one invented example row on each sheet, and a third sheet saying how to fill it in. (Next year, or after changes, press **Download current data** instead: it is the same workbook filled with everything already in the app.)

### Fill in the Students sheet: one row per student

| Column | Must be filled in? | What goes in it |
|---|---|---|
| **Student No.** | Yes | As on the class roll. |
| **Surname** | Yes | |
| **First Name** | Yes | |
| **Middle Name** | No | |
| **Section** | No | For example `Sec - 1`. Judging never needs it, but the **For Encoding** grade sheet is sorted by section: students without one are listed together at the top, so it cannot be organised by section for them. |
| **Email** | Yes | The student's email. Their results email goes here. |
| **Group** | Yes | The group's name, for example `PAYONG PALAY`. |
| **Adviser** | Yes | The group's adviser, for example `SANTOS, MARIA`. |
| **Adviser Email** | No | Where the adviser's results email goes. |

Rules:

- **There is no Groups sheet and no Advisers sheet.** The groups are the different names in the **Group** column; the advisers are the names in the **Adviser** column.
- **Every row of one group must name the same adviser.** A group has one adviser; an adviser can have many groups. If the rows of a group name different advisers, **that whole group is not imported**, and the message names the group and which rows say what, for example "Group PINILI was not imported: its rows name different advisers (rows 4 and 5 say REYES, ANA; row 9 says CRUZ, BEN)". Correct the rows and upload again.
- The same goes for **Adviser Email**: every row of a group that has one must give the same email. A row with it empty is fine.
- **Why the Adviser Email column is there:** each adviser gets an email with their groups' results, and this column is the only place the app can learn the address. An adviser without one gets no email; the Close the event tab lists them before you send anything.
- **To remove an adviser's email address**, clear it in the Data table. Emptying the cell in the workbook and uploading it will not remove it.
- Group names are compared **ignoring spacing, punctuation and capitals**, so `Payong Palay` and `PAYONG PALAY` are the same group. Adviser names are compared the same way.
- A student number that appears twice: the later row is used, and the message says so.

### Fill in the Judges sheet: one row per judge

| Column | Must be filled in? | What goes in it |
|---|---|---|
| **Name** | Yes | The name judges see, for example `Dr. Liza Manalo`. |
| **Email** | Yes | What the judge types to sign in. |
| **Password** | No | Leave it **empty** and the app makes a password for a new judge. Type one and it is used exactly as typed. |

A judge from an earlier year keeps their account and their record in Judge profiles. An empty Password never changes an existing judge's password; a typed one replaces it.

### Upload it

1. Save the workbook as **Excel Workbook (.xlsx)**.
2. On the **Data** tab, press **Choose File**, pick the workbook, and press **Upload workbook**.
3. A green message says what changed, for example "1 new student, 2 new judges". A yellow box lists anything in the file that was skipped and why. Correct those rows in Excel and upload again; uploading the same file twice never adds anyone twice.
4. **If any judge got a password, a sign-in list appears: print it now.** It is laid out to fit one page, with each judge's name, email and password, to hand out at the judges' briefing. Press **Print this list**. **This is the only time the passwords are shown.** The app keeps no copy it can show again. A lost slip is fixed with **Reset password** on the Judges tab (Part E).

**What uploading never does:**

- **It never removes anybody.** A student or judge who is not in the file stays in the app. To remove someone, do it on the Data or Judges tab (Parts D and E).
- **It never touches a score.** Not before judging, not during, not after. Moving a student to another group keeps every score stored; their individual scores from the old group simply stop counting.
- It is refused while the event is closed. Undo closing first (Part K).

A group that an upload leaves with no members and no scores (for example after you fix a typo in its name) disappears by itself. A group that has scores is never removed.

☐ Done: the Data tab shows every student, and every judge has a printed sign-in slip.

---

## Part D. The Data table

The Data tab lists every student with their section, email, group, adviser and adviser email, in one table.

- **Change a detail:** type over it, for example a misspelt surname or email.
- **Move a student to another group:** type the group's name in their **Group** cell and press **Enter**. To start a new group, type its new name, remove the completion, and press **Enter**; the new group gets the student's adviser.
- **Change a group's adviser:** type the new adviser in **Adviser** on **any** row of that group. It changes for every member of the group, because a group has one adviser.
- **Give an adviser an email:** type it in **Adviser email** on any row of one of their groups. It changes on every row of that adviser.
- **Add a student:** type in the empty last row. Student No., Surname, First name, Email, Group and Adviser are needed; Section and Middle name are not. A new student joining an existing group can leave Adviser empty and takes that group's adviser; a different adviser is refused.
- **Remove a student:** select their row and press **Remove student** (or **Ctrl+Delete**, then **Enter**). A student the judges have already scored cannot be removed, because that would delete their scores.
- **Search and filter** by Section, Group or Adviser. Press a group's name to see its scores.

The line above the table counts the students, groups and advisers, and says how many advisers have no email and how many students have no section.

While the event is closed, groups and advisers cannot change and nobody can be added or removed, but names, sections and emails can still be corrected. Once the email file has been downloaded, nothing can change.

---

## Part E. Judges

The **Judges** tab lists the judges of this event.

- **Add one judge:** type their name and email in the empty last row. The app makes a password and shows it once, in a sign-in list to print, above the table.
- **A judge lost their slip or forgot their password:** select their row, press **Reset password**, press **Enter** to confirm. The new password is shown once in the same printable list; the old one stops working and the judge is signed out everywhere.
- **Remove a judge from this event:** select their row, press **Ctrl+Delete**, then **Enter**. Sheets they already submitted still count; they can no longer score.
- **Change a name or email:** type over it. The judge keeps their password.
- **Profile** opens that judge's page in Judge profiles (Part J).

Typing the email of a judge from an earlier year adds that account, with its password unchanged.

---

## Part F. Before the night

1. Hand each judge their sign-in slip.
2. Ask each judge to open the web address on their phone **once before the event**, on Wi-Fi or mobile data, and sign in. (A phone that has never opened the app cannot load it with no connection.)
3. To rehearse, use the practice event, never the real one: there is no button to delete a whole sheet of scores.

Judges can score as soon as they are added to an event, until you close it.

☐ Done: every judge has signed in once.

---

## Part G. What a judge does on the night

Give this part to the judges.

1. Open the web address on your phone and sign in.
2. At the top, tap **Defense** or **Booth**, whichever you are judging. The screen turns green for Defense and gold for Booth.
3. Tap the group in front of you. You can search by group name or adviser.
4. Check the group name at the top matches the group in front of you.
5. You are on the first category. Each row has a number, the criterion, a large box, and the maximum beside it (for example **/20**).
6. Tap the first box and type the score. Press **Next** (or **Enter**) on the keypad to move to the next box. After the last box, Next moves to the next category.
7. Scores can have up to two decimal places, for example `17.5` or `8.75`. If you type more than the maximum, or a third decimal place, the row turns red and says why, for example "Max is 20. You typed 25, so it is not counted yet." Tap the box and type the correct score.
8. A 0 shows an amber "0 points. Intended?" note. It is allowed; it is only a reminder.
9. Defense judges only: the **Members** step shows one card per student, each with **Presentation /20**, **Communication /40** and **Q&A /40**. Score every member. If a student is **not at the defense**, tap **Absent** on their card instead: their boxes disappear, their individual scores count as zero, and every judge sees them as absent. Tap **Not absent** to undo.
10. Tap **Review**. It lists every category with your percentage, and every blank box and every error. Tap **Go** beside any of them to jump straight to that box.
11. When nothing is blank or red, **Mark group complete** turns green. Tap it. **Your scores for this group count only after you tap it.** A group you scored but did not mark complete counts for nothing.
12. Tap **All groups** and pick the next group.

About saving:

- There is no Save button. Every score is kept on the phone the moment it is typed and sent in the background.
- The label at the top right says **All saved**, **Sending 2…**, or **Offline · 3 kept on phone**.
- If the connection drops, keep scoring. Do not close the browser's private tab or clear the browser. The scores send by themselves when the connection is back.
- If it says **Sign in to send 3**, tap **Sign in again** in the yellow message, sign in, and open the same group again.
- To change a group you already marked complete, open it and tap **Edit scores**. While you edit, that group's scores from you stop counting; tap **Mark group complete** again when you are done.

---

## Part H. Watch the progress

1. On a laptop, press the **Progress** tab.
2. The two boxes at the top show, for each half, how many groups have at least one submitted sheet.
3. **By group** lists every group. For each half:
   - **No scores** (red): no judge has scored it yet.
   - **Nothing submitted** (red): a judge has started, but nobody has marked it complete, so the group has no score in that half yet.
   - **✓ 2 submitted** (green): two judges marked it complete. Only these scores count.
   - **1 in progress · not counted** (grey): a judge has started but not tapped **Mark group complete**. The judge's name and how many criteria they have filled are shown beside it. **None of those scores count** until the judge submits.
4. **By judge** shows how many sheets each judge has submitted and how many are still in progress.
5. Reload the page to see the latest.

**Only a submitted sheet counts.** A sheet a judge started and never marked complete is left out of every percentage, rank, leaderboard, grade, both files and Judge profiles.

If a group shows **No scores** or **Nothing submitted** in a half at the end of the night, find the judge for that half before closing the event. A gold **only 1** means a half has just one submitted sheet: it counts, but a second judge makes the result steadier.

### Correcting a judge's score

You can correct any judge's score yourself, for example when a judge tells you they typed 13 instead of 18.

1. On the **Progress** tab, tap the group's name, or the **Defense** or **Booth** pill beside it. (Pressing a group's name on the Data, Results or Individual grades tables opens the same page.)
2. The scores are one table: a row for each criterion (and, for Defense, each member's Presentation, Communication and Q&A), a column for each judge, and the **Average of submitted**. Each judge's heading says whether their sheet is **submitted** or **in progress, not counted**. Use **Category or member** to show one category or one student.
3. Type a short reason in **Reason for these corrections**, for example `Judge confirmed 18, typed 13`. A reason is required; the table will not take a change without one.
4. Click the judge's score and type the new one, then press **Enter**. Empty the cell to remove the score altogether. A score above that row's maximum is refused and stays red.
5. The green message says what changed. The same reason is used for every correction until you change the box.

The judge's own score is kept. The corrected cell turns yellow; select it and the line under the table says who corrected it, what the judge gave and your reason. **Corrections made** at the bottom of the page lists every correction with who and when (reload the page to see new ones there). The workbook's **Scores** and **Booth Scores** sheets list corrections in their last column.

You can correct scores while the event is open and after it is closed, until the email file has been downloaded.

### A student absent from the defense

**Absent means the student's individual scores are zero**, and their grade is worked out as usual from those zeros and their group's score. This is the department's rule.

- A judge marks it on the Members step (Part G), or you mark it on the **Close the event** tab or in the **At the defense** column of **Individual grades**.
- **To give an absent student a different grade**, open their group's defense scores (above) and type their individual scores in any judge's column, with a reason. A score you type counts; only the fields nobody scored stay zero. The workbook and the email file both follow, so they always agree.

---

## Part I. Read the results

How scores are worked out:

- **Only a submitted sheet counts.** A judge's scores for a group count once the judge taps **Mark group complete**. A sheet started and never submitted is ignored everywhere: results, ranks, leaderboards, grades, both files and Judge profiles.
- **A blank is never a zero.** A criterion, category or half that nobody scored shows a dash and is left out of the arithmetic. A category percentage uses only the criteria that have a score; a half averages only the categories that have a percentage; a group with no booth scores has its defense half as its overall. (The one exception is a student marked absent: their individual scores are zero.)
- **Incomplete groups are not ranked.** A group reads **Incomplete** until every criterion in both halves has a score on at least one submitted sheet. It gets no rank and no place on the leaderboard, so a half-judged group never looks like a low score.
- **Two decimal places.** Every percentage shows two decimals, for example 89.85%. The screens and the workbook use the same rounding, so they always show the same number.
- **Ties.** Groups are ranked on the percentages you see. When two groups show the same category percentage, the one with the higher overall score goes first; they share a place only when both are equal. This rule is the same on the leaderboard and in the table.

The **Results** tab has two views, **Groups** and **Individual grades**.

### Groups

1. Press the **Results** tab.
2. **Top 10 for the awarding** shows one small card per category plus **Overall**: what is read out at the awarding. Groups that still share a place are listed alphabetically. Every group tied at 10th place is listed, so in a rare year a card shows eleven or more names; that is correct.
3. **Every group** is a table of all the groups, one row each: the group and its adviser, each category's percentage with its rank after the dot (for example `91.00 · 1`), the **Overall**, its **Rank**, and whether the group is **Complete** or **Incomplete**. It starts in overall order.
   - Click a column heading to sort by it, for example **Paper** to see the paper ranking.
   - Type in **Search** to find a group, or use the **Adviser** and **Judged** lists to show only some groups.
   - A category that is not fully scored shows its percentage with *incomplete* and no rank; nothing scored shows a dash.
   - Click a group's name to open its scores.
4. **Adviser ranking** ranks advisers by the average overall percentage of their ranked groups. Only you see it: an adviser's email lists their own groups, never a position.

### Individual grades

1. Press **Individual grades** under the tabs. Every student in a group is one row, sorted by section and surname.
2. Type a name or student number in **Search** to look up one student. The **Section**, **Group**, **Adviser**, **Letter**, **At the defense** and **Status** lists narrow it down: for example **No grade yet** under Status shows who still needs scores. Select a **Status** cell to see why a student has no grade, and a **Member total** cell to see each judge's three scores.
3. The columns are:
   - **Member total**: for Presentation /20, Communication /40 and Q&A /40, the average across the defense judges who scored it, added up (out of 100). Until every field has at least one judge's score the total is empty; a partial total is never scaled up to 100. An absent student's unscored fields count as zero.
   - **Group overall**: the group's overall percentage.
   - **Final grade**: (member total + group overall) ÷ 2, using the two-decimal numbers shown.
   - **Rounded up**: the final grade rounded up to a whole number (84.5 becomes 85).
   - The **letter** and **quality points**, from the rounded number: 92–100 A (4), 85–91 B+ (3.5), 78–84 B (3), 71–77 C+ (2.5), 64–70 C (2), 57–63 D+ (1.5), 50–56 D (1), 0–49 F (0).
   - **At the defense**: type `Absent` or `Present` to mark a student.
4. A red **No grade yet** says why: the student's individual scores are incomplete, or their group is not fully judged.

---

## Part J. Judge profiles

A basis for knowing your panel, **not for removing anyone**. Only you see this tab. It describes how each judge scored; it does not say what to do about it.

1. Press the **Judge profiles** tab. Each judge has one row:
   - **Groups**: how many groups they scored, in each half.
   - **Marks at**: on the same groups, how far above or below the other judges they score, on average. `−4.20 pts` is about four points lower.
   - **Separates groups**: whether they use the range or give nearly everyone the same mark. **Narrow**, **normal** or **wide**, compared with the other judges on the same groups. The numbers beside it are their lowest and highest score.
   - **Agrees with co-judges**: line the groups up by this judge's scores, then by the other judges'. **High** means much the same order, even when the numbers differ; **medium** partly; **low** a different order.
   - A sentence saying the same in words.
2. Press a judge's name to see them in detail. Choose **Defense** or **Booth** at the top. For every group: **their score**, **the others' average**, the **gap**, where the group comes in **their order and the panel's**, and anything **to look at**:
   - the same mark entered down every criterion of a category, for example "8 entered down all 9 criteria of Paper";
   - criteria left blank;
   - a score far (6 points or more) from every co-judge's, for example "Far from both co-judges (72.50, 70.50)".
3. **Across events** shows one line per event the judge has scored in, so a judge picked again next year builds one record.

Every comparison uses only the co-judges who scored **the same group in the same half**, and only the criteria both scored. A group nobody else scored is listed but not compared. Spread and agreement need at least three compared groups.

Worth remembering, as the page says:

- **Marking hard is not a fault.** Every group's score is averaged across its judges, so a strict judge is absorbed completely.
- Three judges on one evening is a small sample, and the panel's consensus is not the truth.
- A judge who disagrees may be the one paying attention.

---

## Part K. Close the event

Closing locks judging and hands over two files. You can undo it until you download the email file.

### Settle what is left

1. Press the **Close the event** tab. **Before closing** lists every item that **Needs you**; the **Close the event** button stays grey until the list is empty.
2. Settle each item:
   - **"PINILI: no completed Booth sheet"** (or "a criterion nobody has scored"). Ask the judge to finish and tap **Mark group complete**. If the group genuinely cannot be fully judged, for example it never ran a booth, press **Close this group with the scores it has…**, type the reason, and press **Accept with this reason**. Its missing half stays out of its score; it is not counted as zero.
   - **"Andrea Dela Cruz (PAYONG PALAY) has incomplete individual scores."** Ask the defense judges to score them, correct the scores yourself (Part H), or, if the student missed the defense, press **Mark absent from the defense**.
3. Read the gold **Check** items. They do not block closing: a half with only one completed sheet, and sheets a judge has not marked complete (their scores do not count).
4. **Already decided by you** lists accepted groups and absent students, each with **Undo** or **Not absent**.
5. **These people will get no email** lists advisers with no email and students with no grade. Add the missing adviser emails on the Data tab now.
6. Tick **I have checked the progress** and press **Close the event**.

What this does: judges can no longer change any score. Results and grades stop moving, except for corrections you make yourself.

### File 1: the workbook

Press **Download the workbook**. (You can download it before closing too, as a preview; it always shows the scores as they are at that moment.) It has these sheets:

- **Scores**: every defense judge's scores, one row per judge per group, with corrections in the last column.
- **Booth Scores**: the same for booth.
- **Results**: every category percentage and rank, the halves, and the overall, sorted by overall rank, with a **Judged** column (Complete, Incomplete, or Finalised incomplete).
- **Leaderboard**: positions 1 to 10 for each category and overall, with a **Tied** row for each further group sharing 10th place.
- **Individual Grades**: every member's three scores from each judge, their total, the group overall, final grade and letter.
- **For Encoding**: the official grade sheet. FEU header lines, then Member Name, STUDENT NAME (per Class Roll), Student ID, Section, Total Score, Group Overall %, Final Grade (rounded up) and Letter Grade, sorted by section. **Students with no section are listed first, together**, and a line at the end says how many, because the sheet cannot be organised by section for them. The **Note** column marks absent students and says why a grade is blank.

Copy the **For Encoding** rows into the official encoding system as usual.

### File 2: the email file

1. Download the workbook and check it first.
2. Tick **Results are final and ready to send** and press **Download the email file**.
3. **This is final.** From the first download, closing cannot be undone and nothing about the event can change: no score, absence, student or group. The page says when it was downloaded. You can download the same file again at any time.

The email file is an Excel table named **Emails** with three columns, **Email**, **Name** and **Message**, one row per person:

- **Students first, one row each.** The message gives the student their **letter grade** and **their group's score as a percentage**. It never mentions a rank or a placing.
- **Then advisers, one row each**, however many groups they hold. The message lists each of their groups with its percentage, marks each group that placed in the top 10 (naming the categories, never the place), and says that a place in the top 10 is not the same as winning an award, because awards are announced at the ceremony.

Each Message is the whole email, already written. A developer can change the wording in `src/lib/messages.ts`.

### Undo closing

Until the email file is downloaded, open **Undo closing…**, read the warning, tick **Reopen judging** and press **Undo closing**. Judges can change scores again, and a workbook you already downloaded may no longer match. Close the event again when judging is done.

---

## Part L. Send the emails with Power Automate

The app never sends email itself. The email file's **Read me** sheet repeats these steps.

1. Save the email file to OneDrive or SharePoint.
2. In Power Automate, add the Excel Online (Business) action **List rows present in a table**, choose the file, and choose the table **Emails**.
3. In that action's **Settings**, turn **Pagination** on and set the threshold to 1000. Without it, only the first 256 rows are read.
4. Add **Apply to each** over the rows, with an Outlook **Send an email (V2)** action: **To** is Email, **Body** is Message, and type your own **Subject**.
5. Test first: run the flow on a copy of the file with only one row, addressed to yourself, and read the email.

Keep the email file private: it holds every student's grade.

---

## Not built yet

Be aware of these gaps.

- **Changing points, weights or letter bands.** Only the criterion wording can be changed on screen (Part B). Maximums, weights and letter bands cannot. Each event keeps the copy it was created with. A developer can change the default in `src/lib/rubric.ts` before creating next year's event.
- **Renaming a group that already has scores.** A group is its name: an upload or a Group cell with a new name moves students to a new group, and the scores stay with the old one. Fix group names before judging starts.
- **Full offline mode.** Scores typed while offline are kept on the phone and sent later, but a phone that has never opened the app cannot load it offline, and reloading the page with no connection shows the browser's offline page.
- **Deleting scores.** There is no button to delete a whole judge's sheet (for example after a rehearsal); you can only remove scores one at a time, by emptying their cells on the group's scores table (Part H). Rehearse on the practice event.
- **Frozen results.** Closing locks the scores, but results are recalculated each time you open them; there is no stored snapshot or file history.
- **Change history screen.** Score corrections are listed on each group's scores page, but other changes (uploads, moves, closing) are recorded in the database with no screen to read them.
- **First sign-in password change.** Judges are not forced to change their password; they can do it under **Account**.
- **Corrections after the email file.** Once the email file has been downloaded, nothing can change, and there is no "send corrected results" step.

## If something goes wrong

- **The app will not load at all:** open `index.html` from the GitHub repository in any browser. It is the original single-file calculator and still works.
- **You forgot the coordinator password:** a developer runs the emergency reset described in the README ("Emergency password reset").
- **A judge is locked out after wrong passwords:** wait up to five minutes, or press **Reset password** on the Judges tab.
- **A judge lost their sign-in slip:** press **Reset password** on the Judges tab and print the new slip.
- **An upload says a group was not imported:** its rows name different advisers (or adviser emails). Make them the same in Excel and upload again; nothing else changed.
