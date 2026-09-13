# How to run a Tambiz event

A worksheet for the coordinator. Follow the steps in order. Each step is one action.
You do not need to remember anything from last year.

**What you need before you start**

- The app's web address (from Vercel, for example `https://tambiz.vercel.app`).
- Your coordinator email and password.
- The registrar's class roll, saved as an Excel `.xlsx` file.
- The adviser list as an Excel `.xlsx` file (optional; you can type advisers instead).
- The names and emails of the judges.

**Words used here**

- **Event**: one year's Tambiz. Everything else belongs to an event.
- **Half**: Defense (70% of a group's overall score) or Booth (30%).
- **Sheet**: one judge's scores for one group in one half.

---

## Part A. Create the event

1. Open the app's web address on a laptop.
2. Type your coordinator email in **Email**.
3. Type your password in **Password**.
4. Press **Sign in**. You see the **Events** page.
5. Scroll to **Start a new event**.
6. Check the **Year** box shows the right year, for example `2027`. Change it if not.
7. Leave **Title** empty to call it "Tambiz 2027", or type another title.
8. Press **Create event**. You land on the event's home page.
9. Scroll to **Scoring sheet** and check the categories and maximums are right. (They are copied from the newest event. To change them, see "Not built yet" at the end.)

☐ Done: the event exists and its status says **Set-up**.

---

## Part B. Import the class roll

1. On the event page, press the **Class roll** tab.
2. Under **Import the class roll**, press **Choose File** (or **Browse**).
3. Pick the registrar's `.xlsx` file.
4. Press **Import**.
5. Read the green message. It says how many students were imported, how many are new and how many were already there.
6. If a red message says the file "does not fit the class roll", it names the missing column. Open the file in Excel, check that column's heading is spelled as shown (for example `Student No.` or `Section`), save, and repeat from step 2.
7. Check the **On the roll** number matches the number of students you expect.

The file must have these columns: **Student No.**, **Student Email**, **Surname**, **First Name**, **Section**. Any other columns are ignored. The headings do not have to be in the first row.

If students are added or dropped later, import the new file again. Importing the same file twice **updates** students; it never adds them twice.

☐ Done: the roll shows every student.

---

## Part C. Add the advisers

Choose **one** of these.

**With an adviser file**

1. Press the **Advisers** tab.
2. Press **Choose File** and pick the adviser `.xlsx` file. It needs an **Adviser** column. An **Email** column is optional. A **Group Code** or **Group Name** column sets each group's adviser in one go (do this after Part D if you use it).
3. Press **Import**.
4. Read the green message.

**By hand**

1. Press the **Advisers** tab.
2. Scroll to **Add one adviser by hand**.
3. Type the **Name** and, if you have it, the **Email**.
4. Press **Save adviser**.
5. Repeat for each adviser.

☐ Done: every adviser is listed.

---

## Part D. Create the groups and add their members

Do this once for every group.

1. Press the **Groups** tab.
2. Scroll to **Add a group**.
3. Check the **Code** (the app suggests the next one, such as `G09`).
4. Type the **Section**, for example `BA-3A`.
5. Type the **Business name**, for example `Kape Kultura`.
6. Choose the **Adviser** from the list. (If the adviser is not in the list, type their name in **…or type a new adviser** instead.)
7. Press **Add group**. The group's own page opens.
8. Under **Add members from the class roll**, you see the students of that section who are not yet in any group.
9. Tick each member of this group.
10. Press **Add ticked students**. They appear under **Members**.
11. If a member is in another section, type part of their name or student number in the search box, press **Search**, tick them, and press **Add ticked students**.
12. Press **‹ Groups** to go back, and repeat from step 2 for the next group.

Rules the app enforces for you:

- A student can belong to only one group. If you tick someone already in another group, the app says which group and adds nobody.
- Two groups cannot share a code, or a name that differs only in spaces or punctuation ("PAYONG PALAY" and "PayongPalay" count as the same).
- Members are always chosen from the roll. They are never typed.

To fix a mistake: open the group, press **Remove** beside a member, or change the details under **Group details** and press **Save group**.

**Final check**

1. Press the **Class roll** tab.
2. Look at **Not in any group**. It should be 0.
3. If it is not 0, the list below shows who is left. Place each one in a group, or leave them out only if they have dropped the course.

☐ Done: every group has its members and adviser, and no enrolled student is left out.

---

## Part E. Create the judge accounts

Do this once for every judge.

1. Press the **Judges** tab.
2. Scroll to **Add a judge**.
3. Type the name the judge will see, for example `Dr. Liza Manalo`.
4. Type their email (or a short login such as `lmanalo`).
5. Press **Create judge account**.
6. A yellow box shows the login and a temporary password. **Write both down now**, for example on a sign-in slip for that judge. The box disappears after two minutes and the password cannot be shown again.
7. Repeat from step 2 for the next judge.

If a judge forgets their password: press **Reset password** beside their name, write down the new password from the yellow box, and give it to them.

A judge from last year keeps their account. Typing their email again simply adds them to this event.

☐ Done: every judge has a sign-in slip.

---

## Part F. Before the night

1. On the event home page, press **Open judging**. The status changes to **Judging open**.
2. Give each judge their sign-in slip.
3. Ask each judge to open the web address on their phone **once before the event**, on Wi-Fi or mobile data, and sign in. (A phone that has never opened the app cannot load it with no connection.)
4. Optional rehearsal: there is no button to delete scores yet (see "Not built yet"), so rehearse on the sample event or on a separate test event, never on the real one.

☐ Done: judging is open and every judge has signed in once.

---

## Part G. What a judge does on the night

Give this part to the judges.

1. Open the web address on your phone and sign in.
2. At the top, tap **Defense** or **Booth**, whichever you are judging. The screen turns green for Defense and gold for Booth.
3. Tap the group in front of you. You can search by group name, section or adviser.
4. Check the group name at the top matches the group in front of you.
5. You are on the first category. Each row has a number, the criterion, a large box, and the maximum beside it (for example **/20**).
6. Tap the first box and type the score. Press **Next** (or **Enter**) on the keypad to move to the next box. After the last box, Next moves to the next category.
7. Scores can have up to two decimal places, for example `17.5` or `8.75`. If you type more than the maximum, or a third decimal place, the row turns red and says why, for example "Max is 20. You typed 25, so it is not counted yet." Tap the box and type the correct score.
8. A 0 shows an amber "0 points. Intended?" note. It is allowed; it is only a reminder.
9. Defense judges only: the **Members** step shows one card per student, each with **Presentation /20**, **Communication /40** and **Q&A /40**. Score every member.
10. Tap **Review**. It lists every category with your percentage, and every blank box and every error. Tap **Go** beside any of them to jump straight to that box.
11. When nothing is blank or red, **Mark group complete** turns green. Tap it.
12. Tap **All groups** and pick the next group.

About saving:

- There is no Save button. Every score is kept on the phone the moment it is typed and sent in the background.
- The label at the top right says **All saved**, **Sending 2…**, or **Offline · 3 kept on phone**.
- If the connection drops, keep scoring. Do not close the browser's private tab or clear the browser. The scores send by themselves when the connection is back.
- If it says **Sign in to send 3**, tap **Sign in again** in the yellow message, sign in, and open the same group again.
- To change a group you already marked complete, open it and tap **Edit scores**.

---

## Part H. Watch the progress

1. On a laptop, open the event and press the **Progress** tab.
2. The two boxes at the top show, for each half, how many groups have at least one complete sheet.
3. **By group** lists every group. For each half:
   - **No scores** (red): no judge has scored it yet.
   - **✓ 2**: two judges marked it complete.
   - **1 in progress**: a judge has started but not finished. The judge's name and how many criteria they have filled are shown beside it.
4. **By judge** shows how far each judge has got.
5. Reload the page to see the latest.

If a group shows **No scores** in a half at the end of the night, find the judge for that half before closing judging.

---

## Part I. Close judging (finalise)

1. Press the **Progress** tab and scroll to **Close judging**.
2. Check every group has at least one complete sheet in each half.
3. Tick **I have checked the progress above**.
4. Press **Close judging**. The status changes to **Judging closed**.

What this does: judges can no longer change any score. Results and grades stop moving.

A blank score is never counted as zero. Anything nobody scored is left out, and a group that is not fully judged reads **Incomplete** and has no rank. A judge who means zero types `0`, and that counts.

If you closed too early, press **Reopen judging** on the same page.

---

## Part J. Read the results

How scores are worked out:

- **A blank is never a zero.** A criterion, category or half that nobody scored shows a dash and is left out of the arithmetic. A category percentage uses only the criteria that have a score; a half averages only the categories that have a percentage; a group with no booth scores has its defense half as its overall.
- **Incomplete groups are not ranked.** A group reads **Incomplete** until every criterion in both halves has at least one judge's score. It gets no rank and no place on the leaderboard, so a half-judged group never looks like a low score.
- **Two decimal places.** Every percentage shows two decimals, for example 89.85%. The screens and the Excel workbook use the same rounding, so they always show the same number.
- **Ties.** Groups are ranked on the percentages you see. When two groups show the same category percentage, the one with the higher overall score goes first; they share a place only when both are equal. This rule is the same on the leaderboard and in the table.

1. Press the **Results** tab.
2. **Top 10 leaderboard** shows one card per category plus **Overall**. Groups that still share a place are listed alphabetically.
3. **Every group by category** shows each group's overall percentage and rank at the top right (or **Incomplete**), its Defense and Booth halves, and every category percentage with its rank.
4. Press the **Grades** tab. Students are grouped by section. Each card shows:
   - **Member total**: for Presentation /20, Communication /40 and Q&A /40, the average across the defense judges who scored it, added up (out of 100). A field one judge left blank is not counted as zero.
   - **Group overall**: the group's overall percentage.
   - **Final grade**: (member total + group overall) ÷ 2, using the two-decimal numbers shown.
   - **Rounded up**: the final grade rounded up to a whole number (84.5 becomes 85).
   - The **letter** and **quality points**, from the rounded number: 92–100 A (4), 85–91 B+ (3.5), 78–84 B (3), 71–77 C+ (2.5), 64–70 C (2), 57–63 D+ (1.5), 50–56 D (1), 0–49 F (0).
5. A red **No grade yet** says why: the student's member scores are incomplete, or their group is not fully judged. Check with the defense judges.

---

## Part K. Export the grade sheet

1. On the event home page (or the Results or Grades tab), press **Download Excel workbook**.
2. Save the file to OneDrive. Its name includes the event and the date and time.
3. Open it. It has these sheets:
   - **Scores**: every defense judge's scores, one row per judge per group.
   - **Booth Scores**: the same for booth.
   - **Results**: every category percentage and rank, the halves, and the overall, sorted by overall rank.
   - **Leaderboard**: positions 1 to 10 for each category and overall.
   - **Individual Grades**: every member's three scores from each judge, their total, the group overall, final grade and letter.
   - **For Encoding**: the official grade sheet. FEU header lines, then Member Name, STUDENT NAME (per Class Roll), Student ID, Section, Total Score, Group Overall %, Final Grade (rounded up) and Letter Grade, sorted by section.
4. Copy the **For Encoding** rows into the official encoding system as usual.

You can download the workbook as often as you like. It always shows the scores as they are at that moment.

---

## Not built yet

Be aware of these gaps in this first version.

- **Student and adviser links.** Students and advisers cannot see their results in the app yet. Share results from the Excel workbook.
- **Mailing sheet.** There is no mailing sheet for Power Automate yet.
- **Editing the scoring sheet.** Criterion wording, maximums, weights and letter bands cannot be changed from the screens. Each event keeps the copy it was created with. A developer can change the default in `src/lib/rubric.ts` before creating next year's event.
- **Full offline mode.** Scores typed while offline are kept on the phone and sent later, but a phone that has never opened the app cannot load it offline, and reloading the page with no connection shows the browser's offline page.
- **Coordinator corrections.** You cannot change a judge's score yourself; ask the judge to reopen the group with **Edit scores** (judging must be open).
- **Deleting scores.** There is no button to delete a judge's sheet (for example after a rehearsal). A group with scores cannot be deleted.
- **Frozen results.** Closing judging locks the scores, but results are recalculated each time you open them; there is no stored snapshot or file history.
- **Excluding dropped students.** The roll shows students in no group, but there is no "excluded, dropped" marker; they simply stay unplaced.
- **Change history screen.** Changes are recorded in the database but there is no screen to read them.
- **First sign-in password change.** Judges are not forced to change the temporary password; they can do it under **Account**.

## If something goes wrong

- **The app will not load at all:** open `index.html` from the GitHub repository in any browser. It is the original single-file calculator and still works.
- **You forgot the coordinator password:** a developer runs the emergency reset described in the README ("Emergency password reset").
- **A judge is locked out after wrong passwords:** wait up to five minutes, or press **Reset password** on the Judges tab.
