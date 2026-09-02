# Mac app operations

| Need | Tool | Behavior |
| --- | --- | --- |
| Find visible apps | `mac_apps_list` | Read-only list of visible processes and front windows |
| Read current controls | `mac_app_inspect` | Focuses the app and returns bounded accessible controls |
| Open or focus an app | `mac_app_open` | Uses macOS Launch Services |
| Move within a view | `mac_app_scroll` | Bounded keyboard-style scrolling |
| Click a control | `mac_app_click` | Uses the latest inspected element index; waits for approval |
| Enter text | `mac_app_type` | Types up to 8,000 characters; waits for approval |
| Press a key | `mac_app_key` | Supports Return, Escape, Tab, arrows, deletion, and modifiers; waits for approval |

If macOS blocks access, tell the user to enable the app running OpenBot under **System Settings → Privacy & Security → Accessibility**. Screen Recording is not required for the accessibility-tree version of this skill. Some apps expose few or no accessible controls; say so plainly instead of clicking blindly.
