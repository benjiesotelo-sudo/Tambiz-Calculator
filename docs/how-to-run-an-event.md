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
9. Scroll to **Scoring sheet** and check the categories and maximums are right. (They are copied from the newest event, with the criterion wording. Points cannot be changed on screen; see "Not built yet" at the end.) A new event spells the second defense category **Infomercial**; an older event that stored "Informercial" keeps the spelling it was judged under.

☐ Done: the event exists and its status says **Set-up**.

---

## Part A2. Enter the criterion wording

Judges see this wording on their phones. Without it, the rows read "Criterion 1, Criterion 2…". You can do this at any time, even during judging: wording never changes a score.

1. On the event page, press the **Scoring sheet** tab.
2. Each category is a card with one box per criterion. The points for that criterion are printed beside its box, for example **/20**.
3. Type the wording into each box.
4. To paste the whole list instead: in Word or Excel, copy the criteria **one per line, in sheet order** (the 21 defense criteria, then the 18 booth criteria). Click the first box under **Elevator Pitch** and paste. Each line fills the next box, carrying on into the next category. Numbers and bullets at the start of a line are removed. The bar at the bottom says how many boxes were filled.
5. Check a few boxes against your list, especially the last box of each category.
6. Press **Save wording**. The green message says how many criteria have wording.
7. Judges see the new wording the next time they open a group.

The event page's **Scoring sheet** section says how many of the 39 criteria have wording. A new event copies the wording from the newest event, so next year you only change what changed.

☐ Done: the event page says all 39 criteria have their wording.

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

**A student who dropped the course** stays on the roll file but should not be in a group. Judging cannot close while anyone on the roll is in no group, so leave them out on purpose:

1. On the **Class roll** tab, find the student under **Not in any group**.
2. Press **Leave out with a reason…**, type the reason (for example `Dropped the course`), and press **Leave out**.
3. They now show **Left out** with your reason. Press **Undo** if you change your mind. Adding them to a group also undoes it.

Students left out are listed at the bottom of the **For Encoding** sheet with your reason and no grade.

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

**Adviser codes.** After results are released, each adviser opens a private link and types an **adviser code** to see their groups. The code is never in the email, so you hand it out yourself.

1. On the **Advisers** tab, press **Make codes for the advisers without one**. Each adviser gets a code such as `K7Q-4MP`.
2. To choose a code yourself, press **Set code…** beside the adviser, type it, and press **Save code**. (Or add an **Adviser Code** column to the adviser file.)
3. Give each adviser their code, for example on a slip at a faculty meeting. Do not email it.

An adviser without an email or without a code gets no link.

☐ Done: every adviser is listed, with an email and a code.

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

To fix a mistake: open the group, press **Remove** beside a member, or change the details under **Group details** and press **Save group**. Every change to a group's code, name, section or adviser is listed at the bottom of the group's page under **Changes to this group's details**, with who made it and when.

**Final check**

1. Press the **Class roll** tab.
2. Look at **Not in any group**. It should be 0.
3. If it is not 0, the list below shows who is left. Place each one in a group, or leave them out only if they have dropped the course.

☐ Done: every group has its members and adviser, and no enrolled student is left out.

---

## Part E. Create the judge accounts

Judges are a standing department list: an account made one year is kept for the next. **If a judge has judged before, pick them from the list instead of making a new account**, so their record in Judge profiles (Part M) stays together.

**A judge who has judged before**

1. Press the **Judges** tab.
2. Scroll to **Add from the department list**.
3. Press **Add to this event** beside their name. Their password is unchanged; press **Reset password** if they have forgotten it.

**A new judge.** Do this once for every new judge.

1. Press the **Judges** tab.
2. Scroll to **Add a new judge**.
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
9. Defense judges only: the **Members** step shows one card per student, each with **Presentation /20**, **Communication /40** and **Q&A /40**. Score every member. If a student is **not at the defense**, tap **Absent** on their card instead: their boxes disappear, they need no scores, and every judge sees them as absent. Tap **Not absent** to undo. Never type zeros for an absent student.
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

1. On a laptop, open the event and press the **Progress** tab.
2. The two boxes at the top show, for each half, how many groups have at least one submitted sheet.
3. **By group** lists every group. For each half:
   - **No scores** (red): no judge has scored it yet.
   - **Nothing submitted** (red): a judge has started, but nobody has marked it complete, so the group has no score in that half yet.
   - **✓ 2 submitted** (green): two judges marked it complete. Only these scores count.
   - **1 in progress · not counted** (grey): a judge has started but not tapped **Mark group complete**. The judge's name and how many criteria they have filled are shown beside it. **None of those scores count** until the judge submits.
4. **By judge** shows how many sheets each judge has submitted and how many are still in progress.
5. Reload the page to see the latest.

**Only a submitted sheet counts.** A sheet a judge started and never marked complete is left out of every percentage, rank, leaderboard, grade, the Excel workbook and Judge profiles. A group is ranked as soon as one submitted sheet covers every category in each half.

If a group shows **No scores** or **Nothing submitted** in a half at the end of the night, find the judge for that half before closing judging. A gold **only 1** means a half has just one submitted sheet: it counts, but a second judge makes the result steadier.

### Correcting a judge's score

You can correct any judge's score yourself, for example when a judge tells you they typed 13 instead of 18.

1. On the **Progress** tab, tap the **Defense** or **Booth** pill beside the group. (Or open the group and press **Defense scores and corrections**.)
2. Each criterion lists every judge's score. Find the one to change and press **Correct** beside it.
3. Type the new score. Leave the box empty to remove the score altogether.
4. Type a short **Reason**, for example `Judge confirmed 18, typed 13`. A reason is required.
5. Press **Save correction**. The green message shows the old and new score.

The judge's own score is kept. The entry shows **Corrected by the coordinator**, with what the judge gave and your reason, and **Corrections made** at the bottom of the page lists every correction with who and when. The Excel **Scores** and **Booth Scores** sheets list corrections in their last column.

You can correct scores while judging is open and after it is closed, until results are released.

---

## Part I. Close judging (finalise)

Judging can close only when nothing is left unsettled. The **Close judging** section of the **Progress** tab lists every item that **Needs you**, and the **Close judging** button stays grey until the list is empty.

1. Press the **Progress** tab and scroll to **Close judging**.
2. Settle each **Needs you** item:
   - **"G07 Pandesal Plus: no completed Booth sheet"** (or "a criterion nobody has scored"). Ask the judge to finish and tap **Mark group complete**. If the group genuinely cannot be fully judged, for example it never ran a booth, press **Close judging for this group with the scores it has…**, type the reason, and press **Accept with this reason**. Its missing half stays out of its score; it is not counted as zero.
   - **"Carlo Lacson (BA-3A) is on the roll but in no group."** Place them in a group (Part D), or press **Leave this student out with a reason…** (see Part B).
   - **"Andrea Dela Cruz (G01) has incomplete member scores."** Ask the defense judges to score them, correct the scores yourself, or, if the student missed the defense, press **Mark absent from the defense**.
3. Read the gold **Check** items. They do not block closing: a half with only one completed sheet, and sheets a judge has not marked complete. **Scores on a sheet that was not marked complete do not count**, so ask that judge to submit it before you close judging, or accept that it is left out.
4. **Already decided by you** lists accepted groups, absent students and students left out, each with **Undo**.
5. Tick **I have checked the progress above**.
6. Press **Close judging**. The status changes to **Judging closed**.

What this does: judges can no longer change any score. Results and grades stop moving, except for corrections you make yourself.

A blank score is never counted as zero. Anything nobody scored is left out, and a group that is not fully judged reads **Incomplete** and has no rank. A judge who means zero types `0`, and that counts.

**A student absent from the defense** gets no grade from the app. On the **Grades** tab they show **Absent**, and in the workbook their Final Grade and Letter Grade are blank with the note "Absent from the defense: grade to be entered by the coordinator". Enter their grade yourself in the official encoding system. You can also mark a student absent, or not absent, from the group's page.

If you closed too early, press **Reopen judging** on the same page. Judging can be reopened until results are released.

---

## Part J. Read the results

How scores are worked out:

- **Only a submitted sheet counts.** A judge's scores for a group count once the judge taps **Mark group complete**. A sheet started and never submitted is ignored everywhere: results, ranks, leaderboards, grades, the workbook and Judge profiles.
- **A blank is never a zero.** A criterion, category or half that nobody scored shows a dash and is left out of the arithmetic. A category percentage uses only the criteria that have a score; a half averages only the categories that have a percentage; a group with no booth scores has its defense half as its overall.
- **Incomplete groups are not ranked.** A group reads **Incomplete** until every criterion in both halves has a score on at least one submitted sheet. It gets no rank and no place on the leaderboard, so a half-judged group never looks like a low score.
- **Two decimal places.** Every percentage shows two decimals, for example 89.85%. The screens and the Excel workbook use the same rounding, so they always show the same number.
- **Ties.** Groups are ranked on the percentages you see. When two groups show the same category percentage, the one with the higher overall score goes first; they share a place only when both are equal. This rule is the same on the leaderboard and in the table.

1. Press the **Results** tab.
2. **Top 10 leaderboard** shows one card per category plus **Overall**. Groups that still share a place are listed alphabetically. Every group tied at 10th place is listed, so in a rare year a card shows eleven or more names; that is correct, and it matches what each group's own results page says about being in the top 10.
3. **Every group by category** shows each group's overall percentage and rank at the top right (or **Incomplete**), its Defense and Booth halves, and every category percentage with its rank.
4. Press the **Grades** tab. Students are grouped by section. Each card shows:
   - **Member total**: for Presentation /20, Communication /40 and Q&A /40, the average across the defense judges who scored it, added up (out of 100). A field one judge left blank is not counted as zero. Until every field has at least one judge's score the total shows a dash (—) and reads **(incomplete)** here; in the workbook the cell is left empty, with the note beside it saying why. A partial total is never scaled up to 100.
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
   - **Leaderboard**: positions 1 to 10 for each category and overall, with a **Tied** row for each further group sharing 10th place.
   - **Individual Grades**: every member's three scores from each judge, their total, the group overall, final grade and letter.
   - **For Encoding**: the official grade sheet. FEU header lines, then Member Name, STUDENT NAME (per Class Roll), Student ID, Section, Total Score, Group Overall %, Final Grade (rounded up) and Letter Grade, sorted by section.
4. Copy the **For Encoding** rows into the official encoding system as usual.

You can download the workbook as often as you like. It always shows the scores as they are at that moment.

The **Results** sheet has a **Judged** column (Complete, Incomplete, or Finalised incomplete). **Individual Grades** and **For Encoding** have a **Note** column that says why a grade is blank, for example "Absent from the defense: grade to be entered by the coordinator". Students you left out of every group are listed at the end of For Encoding with your reason.

---

## Part L. Release results to students and advisers

Releasing gives every student and adviser a private link to their own results. **The app never sends email.** It gives you a mailing sheet to send from your own faculty mailbox with Microsoft Power Automate.

What people see:

- **A student** sees their own letter grade and final grade, their own average Presentation, Communication and Q&A scores and total, and their group's percentages.
- **An adviser** sees only their own groups' percentages and their own groups' average overall, the figure the adviser ranking uses. Never the full table of advisers, and no student grades.
- **No place number is ever shown to a student or an adviser**: not "3rd of 8", not "7th of 57", and not an adviser's position in the adviser ranking, because the awarding reveals the order. A page may say that a group is in the **top 10** of a category or overall, for example "Top 10 in Marketing, Overall", without saying which place.

The **adviser ranking** is the average of the overall percentages of each adviser's groups. Advisers with the same average share a position. Only you see the positions and the full table, at the bottom of the **Results** tab. Your own screens keep every rank.

How a link works:

- Opening the link shows nothing until the person types a check: **a student types their student number; an adviser types their adviser code** (Part C). Neither is in the email.
- **Five wrong tries lock the link.** You can unlock it.
- A link stays open for **30 days** from when it was issued, and can be opened any number of times. An email scanner that opens it first does no harm.

Before you start: judging is closed (Part I), every adviser has a code (Part C), and you have checked the grades (Part J). **After release, scores can no longer be corrected or cleared, judging cannot be reopened, and a group cannot be deleted.**

After release you can still correct a mistake in a group's **code**, **name** or **adviser**, on the group's page or with the adviser import. The app says what the change affects the moment you make it: a new code or name shows on the members' and adviser's pages; a new adviser changes both advisers' pages and the adviser ranking, and the mailing sheet already sent no longer matches (give an adviser who had no link one with **Download links for the people with none yet**). Every change is recorded with your name and the time on the group's page, so nothing changes out of sight.

1. Press the **Release** tab. If something was changed after judging closed so that an item **Needs you** again (for example you pressed **Undo** on an accepted group, cleared a group's only score, or removed a student from a group), the tab says how many items need you instead of showing the release button. They are listed under **Close judging** on the **Progress** tab; settle them as in Part I, then come back.
2. Read **Check before sending**. It lists students with no email, advisers with no email or code, and any email that contains the person's student number or code. Fix what you can on the Class roll and Advisers tabs.
3. Tick **Results are final and ready for students and advisers**.
4. Press **Release results and download the mailing sheet**. An Excel file downloads.
5. **Save the file to OneDrive straight away.** The links in it cannot be shown again. Keep it private: each link is personal.
6. Reload the **Release** tab. It now says when results were released and shows **Link status**.

**Sending the emails with Power Automate.** The mailing sheet's first sheet is an Excel table named **Mailing** with the columns **Name**, **Email**, **Link** and **Role**. Its **Read me** sheet has the steps. In short:

1. In Power Automate, add the Excel Online (Business) action **List rows present in a table**, choose the saved file, and choose the table **Mailing**.
2. In that action's **Settings**, turn **Pagination** on and set the threshold to `1000`. **Without this, only the first 256 rows are read.**
3. Add **Apply to each** over the rows with an Outlook **Send an email (V2)** action using the Email, Name and Link columns.
4. In the email, tell students the page will ask for their student number, and advisers for the code you gave them. Never put the number or the code in the email.

**Link status** (on the Release tab after release) lists every link: **Sent** (not opened yet), **Opened**, **Locked** or **Expired**.

- **Unlock**: a locked link can be tried again.
- **Reissue**: makes a new link for one person, open for another 30 days, and downloads a mailing sheet with just their row. Their old link stops working. Use it for an expired link, or when someone lost their email.
- **Download links for the people with none yet**: for example an adviser whose code you set after release.
- **Reissue every link…**: only if the mailing sheet was lost or shared by mistake. Every earlier link stops working.

---

## Part M. Judge profiles

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

## Not built yet

Be aware of these gaps.
- **Changing points, weights or letter bands.** Only the criterion wording can be changed on screen (Part A2). Maximums, weights and letter bands cannot. Each event keeps the copy it was created with. A developer can change the default in `src/lib/rubric.ts` before creating next year's event.
- **Full offline mode.** Scores typed while offline are kept on the phone and sent later, but a phone that has never opened the app cannot load it offline, and reloading the page with no connection shows the browser's offline page.
- **Deleting scores.** There is no button to delete a whole judge's sheet (for example after a rehearsal); you can only remove scores one at a time with **Correct**. A group with scores cannot be deleted.
- **Frozen results.** Closing judging locks the scores, but results are recalculated each time you open them; there is no stored snapshot or file history.
- **Change history screen.** Score corrections are listed on each group's scores page and changes to a group's details on the group's page, but other changes (imports, members, status) are recorded in the database with no screen to read them.
- **First sign-in password change.** Judges are not forced to change the temporary password; they can do it under **Account**.
- **More on links.** Wrong tries are counted per link only, not also per network. A link's 30 days cannot be extended on its own; reissue it instead. A mailing sheet cannot be downloaded again: if it is lost, reissue the links.
- **Corrections after release.** Once results are released, only a group's code, name or adviser can be corrected (Part L); scores cannot, and there is no "issue corrected results" step.

## If something goes wrong

- **The app will not load at all:** open `index.html` from the GitHub repository in any browser. It is the original single-file calculator and still works.
- **You forgot the coordinator password:** a developer runs the emergency reset described in the README ("Emergency password reset").
- **A judge is locked out after wrong passwords:** wait up to five minutes, or press **Reset password** on the Judges tab.
