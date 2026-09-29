// OpenBot.app's main executable. It starts the OpenBot service as a child
// process and waits for it, so macOS treats OpenBot.app as the responsible
// app: privacy permissions (Full Disk Access for Messages, Automation) are
// listed and granted as "OpenBot", and the service inherits them.
//
// It runs Contents/Resources/openbot-launch with /bin/sh, passing its own
// arguments through. That script decides what to do: `--serve` runs the
// service in the foreground (for launchd); no arguments opens the studio.
#include <limits.h>
#include <mach-o/dyld.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;
static pid_t child = 0;

static void forward(int signal_number) {
  if (child > 0) kill(child, signal_number);
}

int main(int argc, char *argv[]) {
  char self[PATH_MAX], resolved[PATH_MAX], script[PATH_MAX + 64];
  uint32_t size = sizeof(self);
  if (_NSGetExecutablePath(self, &size) != 0 || !realpath(self, resolved)) return 70;
  // .../OpenBot.app/Contents/MacOS/OpenBot -> .../OpenBot.app/Contents
  char *slash = strrchr(resolved, '/');
  if (!slash) return 70;
  *slash = '\0';
  slash = strrchr(resolved, '/');
  if (!slash) return 70;
  *slash = '\0';
  snprintf(script, sizeof(script), "%s/Resources/openbot-launch", resolved);

  char bundle[PATH_MAX];
  snprintf(bundle, sizeof(bundle), "%s", resolved);
  slash = strrchr(bundle, '/');
  if (slash) *slash = '\0';
  setenv("OPENBOT_APP_BUNDLE", bundle, 1);

  char **args = calloc((size_t)argc + 2, sizeof(char *));
  if (!args) return 71;
  args[0] = "/bin/sh";
  args[1] = script;
  for (int i = 1; i < argc; i++) args[i + 1] = argv[i];

  signal(SIGTERM, forward);
  signal(SIGINT, forward);
  signal(SIGHUP, forward);
  if (posix_spawn(&child, "/bin/sh", NULL, NULL, args, environ) != 0) return 71;
  int status = 0;
  while (waitpid(child, &status, 0) < 0) {}
  return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}
