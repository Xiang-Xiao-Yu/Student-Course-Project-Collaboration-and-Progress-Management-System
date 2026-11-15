using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class EntryPoint
{
    [STAThread]
    private static int Main()
    {
        var runtime = Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA")
            ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SCPC.DesktopRuntime");
        var bootstrap = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bootstrap.mjs");
        try
        {
            if (!File.Exists(bootstrap)) throw new FileNotFoundException();
            using (Process.Start(new ProcessStartInfo {
                FileName = Path.Combine(runtime, "SCPC.Host.exe"),
                Arguments = "\"" + bootstrap + "\"",
                WorkingDirectory = runtime,
                UseShellExecute = false
            })) { }
            return 0;
        }
        catch (Win32Exception) { return ShowError(); }
        catch (FileNotFoundException) { return ShowError(); }
    }

    private static int ShowError()
    {
        MessageBox.Show("缺少启动文件或无法打开程序。请重新运行安装包并选择“修复”。",
            "学生课程项目协作与进度管理系统", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }
}
