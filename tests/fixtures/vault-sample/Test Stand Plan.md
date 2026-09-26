---
tags: [sample, engineering]
updated: 2026-09-18
---
# Test Stand Plan

## Overview

The test stand is a small bench that lets us run the probe cold and measure its field before the full build. It has three parts: the cryostat from the [[Cryostat Vendor Shortlist]], a magnet power supply, and a rack of instruments. This plan says what gets built in which order and what each step must show before the next one starts. Terms are defined in [[Glossary]], and the section on the separatrix is at [[Glossary#Separatrix]].

## Milestones

Milestone one is a warm fit check of the probe in the bore, due in October. Milestone two is the first cold test at four kelvin, due in November. Milestone three is a field map at full current, due before the year ends. Each milestone has a written pass condition and a person who signs it off. The dates move only when the weekly log records why.

## Instrumentation

The rack holds a temperature monitor with eight channels, a current shunt read by a six digit meter, and a Hall probe on a stepper stage. Every reading is logged to a file with a timestamp, and the file name carries the milestone number. Calibration certificates for the shunt and the Hall probe are stored next to the plan. Nothing is read by hand.

## Risks

The main risk is the cryostat lead time, because a late unit pushes every milestone. The second risk is the vibration of a pulse tube unit, which could blur the field map. The third risk is that the stepper stage does not fit the bore if the bore is the flange diameter rather than the clear diameter. Each risk has an owner and a check in the weekly log.

## Budget notes

The grant covers the cryostat, the supply and the rack. Travel to the vendor is not covered and needs a separate approval. The deck that describes the stand to reviewers follows [[Deck Style Notes]] so the numbers match the plan.
