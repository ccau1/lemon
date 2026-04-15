# Workflow Steps

The SDD workflow consists of five steps:

## 1. Spec

Define what needs to be built. The AI acts as a product manager to help refine and structure the spec.

## 2. Plan

Given the spec, the AI produces a high-level implementation plan.

## 3. Tasks

The plan is broken into concrete, checkable tasks.

## 4. Implement

The AI describes the code changes, file names, and approach needed to complete the tasks.

## 5. Done

The ticket is complete.

## Auto-Approve

Each step can be configured to auto-approve in `config.yaml`:

```yaml
autoApprove:
  spec: true
  plan: true
  tasks: false
  implement: false
  done: false
```

When enabled, the workflow engine automatically generates the artifact and advances the ticket.
