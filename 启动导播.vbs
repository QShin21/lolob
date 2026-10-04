Option Explicit

Dim taskShell, taskFiles, taskRoot, taskScript, taskCommand, taskArgument
Dim taskOptions, taskShowConsole, taskWindowStyle, taskPowerShell
Dim taskBrowser, taskConsole, taskRebuild, taskLan
Set taskShell = CreateObject("WScript.Shell")
Set taskFiles = CreateObject("Scripting.FileSystemObject")
taskRoot = taskFiles.GetParentFolderName(WScript.ScriptFullName)
taskScript = taskFiles.BuildPath(taskRoot, taskFiles.GetBaseName(WScript.ScriptFullName) & ".ps1")
taskPowerShell = taskShell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
taskOptions = ""
taskShowConsole = False
taskBrowser = False
taskConsole = False
taskRebuild = False
taskLan = False

For Each taskArgument In WScript.Arguments
  Select Case LCase(taskArgument)
    Case "-browser"
      taskShowConsole = True
      taskBrowser = True
      taskConsole = True
    Case "-console"
      taskShowConsole = True
      taskConsole = True
    Case "-rebuild"
      taskRebuild = True
    Case "-lan"
      taskLan = True
    Case Else
      taskShell.Popup "Unknown launch option: " & taskArgument & vbCrLf & "Available options: -Browser, -Rebuild, -Lan, -Console", 0, "RiftCast", 16
      WScript.Quit 2
  End Select
Next

If taskBrowser Then taskOptions = taskOptions & " -Browser"
If taskConsole Then taskOptions = taskOptions & " -Console"
If taskRebuild Then taskOptions = taskOptions & " -Rebuild"
If taskLan Then taskOptions = taskOptions & " -Lan"

taskCommand = Chr(34) & taskPowerShell & Chr(34) & " -NoLogo -NoProfile -ExecutionPolicy Bypass"
If taskShowConsole Then
  taskWindowStyle = 1
Else
  taskWindowStyle = 0
  taskCommand = taskCommand & " -WindowStyle Hidden"
  taskOptions = taskOptions & " -HiddenLaunch"
End If
taskCommand = taskCommand & " -File " & Chr(34) & taskScript & Chr(34) & taskOptions
taskShell.CurrentDirectory = taskRoot

On Error Resume Next
taskShell.Run taskCommand, taskWindowStyle, False
If Err.Number <> 0 Then
  taskShell.Popup "RiftCast could not start PowerShell." & vbCrLf & Err.Description, 0, "RiftCast", 16
  WScript.Quit 1
End If
