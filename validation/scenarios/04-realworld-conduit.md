# Scenario 4: RealWorld Conduit — Content Management CRUD

**Target**: `https://demo.realworld.show`
**Complexity**: Complex (~25 commands)
**Time**: ~5 minutes

## What This Tests

A Medium.com clone ("Conduit") with user registration, article CRUD, comments,
and tag-based navigation. Tests multi-step stateful workflows where later steps
depend on earlier ones (sign up → create article → verify in feed → comment →
clean up). This is the most demanding scenario because it requires the LLM to
track state across many commands.

**Note**: This site uses session isolation — each session gets a fresh backend
state. Previously created accounts may not persist. Always sign up fresh.

## Commands Exercised

| Command       | Used For                                                          |
| ------------- | ----------------------------------------------------------------- |
| `open`        | Start session                                                     |
| `snapshot`    | Read page state                                                   |
| `fill`        | Registration form, login, article editor, comments                |
| `click`       | Sign Up button, navigation links, publish, submit comment, delete |
| `type`        | Article body (multi-line content)                                 |
| `assert`      | Verify article content, page elements, user state                 |
| `asserturl`   | Verify navigation to correct pages                                |
| `asserttitle` | Verify page title                                                 |
| `navigate`    | Return to home page                                               |
| `screenshot`  | Capture article state                                             |
| `export`      | Generate test file                                                |
| `stop`        | End session                                                       |

## Steps

### Setup

```bash
# 1. Open the Conduit app
cypress-cli open https://demo.realworld.show
```

**Expected**: Home page with "Conduit" logo, "Global Feed" tab, article
previews, and "Popular Tags" sidebar. Navigation shows "Home", "Sign in",
"Sign up" links.

---

### User Registration

```bash
# 2. Click "Sign up" in the navigation
cypress-cli click <signup-link-ref>
```

**Expected**: Registration form with username, email, and password fields.

```bash
# 3. Fill username (use a unique name to avoid conflicts)
cypress-cli fill <username-ref> 'testuser42'
```

```bash
# 4. Fill email
cypress-cli fill <email-ref> 'testuser42@example.com'
```

```bash
# 5. Fill password
cypress-cli fill <password-ref> 'P@ssword123!'
```

```bash
# 6. Click Sign Up button
cypress-cli click <signup-button-ref>
```

**Expected**: Navigates to home page. Navigation now shows the username
("testuser42") instead of "Sign in" / "Sign up". Also shows "New Article"
and "Settings" links.

```bash
# 7. Verify we're logged in — assert username in nav
cypress-cli assert <username-nav-ref> contain 'testuser42'
```

**Expected**: Assertion passes.

---

### Create an Article

```bash
# 8. Click "New Article" in the navigation
cypress-cli click <new-article-link-ref>
```

**Expected**: Article editor form with title, description ("What's this article
about?"), body (markdown), and tags fields.

```bash
# 9. Verify we're on the editor page
cypress-cli asserturl contain 'editor'
```

**Expected**: Assertion passes.

```bash
# 10. Fill article title
cypress-cli fill <title-ref> 'Cypress CLI Validation Test'
```

```bash
# 11. Fill article description
cypress-cli fill <description-ref> 'Testing the cypress-cli tool against a real web application'
```

```bash
# 12. Fill article body (use type for longer content)
cypress-cli type <body-ref> 'This article was created by an automated validation scenario for cypress-cli. It tests the full create-read-update-delete workflow against the RealWorld Conduit demo application.'
```

```bash
# 13. Fill a tag
cypress-cli fill <tags-ref> 'cypress'
```

```bash
# 14. Press Enter to submit the tag
cypress-cli press Enter
```

```bash
# 15. Click the "Publish Article" button
cypress-cli click <publish-button-ref>
```

**Expected**: Navigates to the article view page. Shows the title "Cypress CLI
Validation Test", the article body text, and the author "testuser42".

---

### Verify the Article

```bash
# 16. Assert the article title is displayed
cypress-cli assert <article-title-ref> contain 'Cypress CLI Validation Test'
```

**Expected**: Assertion passes.

```bash
# 17. Assert the author name
cypress-cli assert <author-ref> contain 'testuser42'
```

**Expected**: Assertion passes.

```bash
# 18. Take a screenshot of the published article
cypress-cli screenshot --filename conduit-article
```

**Expected**: Screenshot saved.

---

### Add a Comment

```bash
# 19. Scroll down to the comment section and type a comment
cypress-cli fill <comment-ref> 'Great article! This comment was added by the validation scenario.'
```

```bash
# 20. Click "Post Comment"
cypress-cli click <post-comment-button-ref>
```

**Expected**: Comment appears below the article with text and author name.

```bash
# 21. Assert the comment is visible
cypress-cli assert <posted-comment-ref> contain 'Great article'
```

**Expected**: Assertion passes.

---

### Navigate Home and Verify Feed

```bash
# 22. Navigate back to the home page
cypress-cli navigate https://demo.realworld.show
```

**Expected**: Home page with feed. Should now show "Your Feed" tab (since we're
logged in).

```bash
# 23. Click "Your Feed" tab
cypress-cli click <your-feed-tab-ref>
```

**Expected**: Shows articles by followed users (may be empty since we haven't
followed anyone). The article we created should appear here or in Global Feed.

```bash
# 24. Click "Global Feed" to see all articles
cypress-cli click <global-feed-tab-ref>
```

**Expected**: Shows all articles including ours. Verify our article title
appears in the list.

---

### Teardown

```bash
# 25. Export the full test
cypress-cli export --file /tmp/cypress-cli-validation/conduit.cy.ts --describe 'RealWorld Conduit' --it 'should register, create article, and comment' --baseUrl https://demo.realworld.show
```

**Expected**: A `.cy.ts` file with the full CRUD flow:

- `cy.visit('/')` (relative due to `--baseUrl`)
- Registration fill + click
- Article creation fill + type + click
- Assertion `.should()` calls
- Comment fill + click
- Navigation back to home

Verify the exported code would produce a meaningful test if run.

```bash
# 26. Stop the session
cypress-cli stop
```

## Success Criteria

- [ ] User registration completes successfully
- [ ] Session state (login) persists across navigations
- [ ] Article creation with title, description, body, and tags works
- [ ] `fill` vs `type` both work for different length content
- [ ] Article is visible on the view page after publishing
- [ ] Comment creation works
- [ ] Navigation between pages works within one session
- [ ] Assertions correctly validate content at each stage
- [ ] Exported test is a complete, coherent Cypress test
- [ ] `--baseUrl` produces relative URLs in export

## Notes

- **Session isolation**: `demo.realworld.show` resets state per session. If the
  session breaks mid-scenario, you may need to re-register.
- **Unique usernames**: If "testuser42" is taken, vary the number. The demo
  backend may already have this user from previous runs.
- **Tag submission**: Tags are added by typing in a field and pressing Enter.
  The tag appears as a chip/pill below the input.
- **Article body**: The editor may support markdown, but we're testing plain
  text input only.
- **Cross-origin**: The app is a single-origin SPA (Angular), so no
  cross-origin issues expected.
- This is the longest scenario and tests the most commands in sequence.
  It's the closest to a "real LLM test generation workflow."
