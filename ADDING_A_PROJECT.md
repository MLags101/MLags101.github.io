# How to Add a New Project to Your Portfolio

Because your website now uses **Jekyll** (the engine behind GitHub Pages) for template inheritance, adding a new project is easier and requires writing much less code!

## Step 1: Create a Project Folder
1. In the root of your repository, create a new folder for your project (e.g., `MyNewProject`).
2. Inside this folder, create an `images` folder (e.g., `MyNewProject/images/`) and place any pictures or videos related to the project in it.

## Step 2: Create the `index.html` File
Create a new `index.html` file inside your project folder (e.g., `MyNewProject/index.html`).

Instead of copying the entire website code (with the header, footer, etc.), you **only** need to include the "Front Matter" and the actual content of your project.

### Example Template:

```html
---
layout: default
title: Your Project Title Here
hero_image: /MyNewProject/images/hero.jpg
date_completed: "Month Year"
skills:
  - name: "SolidWorks"
    level: 5
  - name: "Python"
    level: 4
  - name: "3D Printing"
    level: 3
---

<!-- Hero Section -->
<section id="top" class="one dark cover">
    <div class="container">
        <header>
            <div class="translucent-bg">
                <h2 class="alt"><strong>Your Project Title Here</strong></h2>
            </div>
        </header>
    </div>
</section>

<!-- Content Section -->
<section id="about" class="three">
    <div class="container">

        <header><h2>Overview</h2></header>

        <p>Write a brief overview of the project here.</p>

        <hr>

        <h3>Design</h3>

        <p>Describe the design process...</p>

        <div class="image-container">
            <img src="images/your_image_1.jpg" alt="Description" width="500" loading="lazy"/>
            <img src="images/your_image_2.jpg" alt="Description" width="500" loading="lazy"/>
        </div>

        <hr>

        <h3>Results</h3>

        <p>Describe the outcome...</p>

    </div>
</section>
```

### Front Matter Options
- `layout: default` — Required. Uses the site-wide template.
- `title:` — The page title shown in the browser tab.
- `hero_image:` — Path to the background image for the hero section (optional).
- `date_completed:` — Shown in the project overview (optional).
- `skills:` — A YAML list of objects with `name` and `level` (1–5). These render as tags with significance dots at the bottom of the project page. Indent each `level` under its `- name`, as in the example above.

## Step 3: Add the Project to the Main Page
The homepage project grid is generated from `_data/projects.yml`. To add a project card, add a new entry to that file instead of editing `index.html`.

```yaml
- title: "Your Project Title Here"
  url: "/MyNewProject/"
  image: "/MyNewProject/images/cover_image.jpg"
  alt: "Short image description"
  date_completed: "Month Year"
  importance: 7
  card_size: "large"
  skills:
    - name: "SolidWorks"
      level: 5
    - name: "Python"
      level: 4
```

Homepage projects are sorted by `importance` from highest to lowest; use a value from 1 to 10. Use `card_size` when you want to override the automatic importance-based sizing. Supported values are `featured`, `wide`, `large`, `medium`, `small`, `compact`, and `standard`. For external project links, add `external: true`.

## Step 4: Push to GitHub!
Once you commit and push your changes to GitHub, GitHub Pages will automatically wrap your project's content inside the main layout (adding the sidebar and footer) and publish it live!
