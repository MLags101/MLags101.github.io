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
skills:
  - SolidWorks
  - Python
  - 3D Printing
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
- `skills:` — A YAML list of skills/tools. These automatically render as tags at the bottom of the project page.

## Step 3: Add the Project to the Main Page
To make sure people can actually navigate to your new project, you must add a link to it on your homepage (`index.html` in the root folder).

1. Open the main `index.html` file.
2. Scroll down to the `<section id="portfolio" class="two">` section.
3. Find the column (`<div class="col-6 col-12-mobile">`) where you want the new project to appear.
4. Add the following HTML snippet, adjusting the `href`, image `src`, and `<h3>` text:

```html
<article class="item">
    <a href="/MyNewProject/" class="image fit"><img src="/MyNewProject/images/cover_image.jpg" alt="" loading="lazy"/></a>
    <header>
        <h3>Your Project Title Here</h3>
    </header>
</article>
```

## Step 4: Push to GitHub!
Once you commit and push your changes to GitHub, GitHub Pages will automatically wrap your project's content inside the main layout (adding the sidebar and footer) and publish it live!
