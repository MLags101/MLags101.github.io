# STM Remote Project Overview

## Purpose
This document is a working brief for another agent writing or expanding the STM Remote portfolio content. The project is a custom controller built around the STM32 microcontroller family, intended to continue the author's embedded systems learning and improve on an earlier custom remote.

## Current Site Context
- Existing project page: `STMRemote/index.html`
- Homepage card data: `_data/projects.yml`, entry title `STM Remote`
- Current project date: `April 2024`
- Current hero image: `/images/stmremote.png`
- Homepage card image: `/images/stmremote.png`
- Project-local images:
  - `STMRemote/images/display.jpg`
  - `STMRemote/images/stm_sch.png`
  - `STMRemote/images/stm_rem_sch.png`
  - `STMRemote/images/stm_rem_2d.png`
  - `STMRemote/images/stm_rem_pcb.png`

## Core Story
STM Remote is a custom PCB and embedded systems project focused on learning the STM32 ecosystem through a practical controller. It evolves the previous Custom Remote project from a simpler trigger-style interface into a richer robotic control device with a larger button array and an accelerometer/gyro module.

The key design idea is more intuitive robot control. Instead of only pressing buttons, the user can use hand motion through the IMU to direct movement, making the controller more natural for people who are newer to operating robots.

## Technical Details Already Established
- Microcontroller platform: STM32 family
- PCB design tool: KiCAD
- Firmware language/area: Embedded C
- Sensor integration: IMU, specifically accelerometer/gyro functionality
- Hardware learning areas:
  - External crystal oscillator circuit
  - Power delivery capacitor network
  - STM32 datasheet-driven design
  - Fabrication constraints when using an external board house
- Learning references mentioned in the current page:
  - Phil's Lab on YouTube
  - STMicroelectronics datasheets

## Current Skills Metadata
The project page lists:
- KiCAD, level 5
- STM32, level 5
- Embedded C, level 4
- PCB Fabrication, level 4
- IMU Integration, level 3

The homepage card currently shows:
- KiCAD, level 5
- STM32, level 5
- Embedded C, level 4

## Suggested Writing Direction
Frame the project as a transition from board-level PCB design into more serious embedded system design. The author should come across as learning by building: moving from an earlier radio remote concept into an STM32-based control board with more complex input, sensor, clock, and power requirements.

Good section angles:
- Why STM32 was chosen as the next embedded learning step
- How the remote improves on the previous project
- Why IMU-based control matters for robotics usability
- What made STM32 hardware design harder than expected
- How board fabrication changed the design process because mistakes carried time cost

## Tone and Constraints
- Keep the tone first-person, practical, and reflective, matching the existing portfolio.
- Emphasize hands-on engineering, iteration, and learning from datasheets.
- Do not invent exact STM32 part numbers, radio protocols, battery specs, firmware architecture, or finished performance results unless the user provides them.
- Do not claim the project is fully complete beyond what the site already states.
- Prefer concrete language over vague claims like "advanced embedded system."

## Useful Page Structure
If rewriting or expanding `STMRemote/index.html`, a clean structure would be:
1. Overview: STM32 learning goal and evolution from the previous remote
2. Control Concept: button array plus IMU-based hand motion control
3. PCB Design: KiCAD layout, schematic work, oscillator, and power network
4. Fabrication Lessons: board house lead times and why careful review mattered
5. Next Steps or Reflection: what the project taught about embedded design

