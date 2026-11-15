using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("学生课程项目协作与进度管理系统")]
[assembly: AssemblyProduct("学生课程项目协作与进度管理系统")]

internal static class Launcher
{
    private const string Title = "学生课程项目协作与进度管理系统";
#if INSTALLED
    private static string Folder;
    private static readonly string BinaryFolder = AppDomain.CurrentDomain.BaseDirectory;
#else
    private static readonly string Folder = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SCPC-便携版");
    private static readonly string BinaryFolder = Folder;
#endif

    [STAThread]
    private static int Main(string[] args)
    {
#if INSTALLED
        if (args.Length != 1 || !Path.IsPathRooted(args[0]) ||
            !String.Equals(Path.GetFileName(args[0]), "bootstrap.mjs", StringComparison.OrdinalIgnoreCase))
            return 1;
        Folder = Path.GetDirectoryName(args[0]);
#endif
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string key;
        using (var hash = SHA256.Create())
            key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Folder.ToUpperInvariant())));

        using (var mutex = new Mutex(false, @"Local\SCPC-" + key))
        {
            bool acquired;
            try { acquired = mutex.WaitOne(0); }
            catch (AbandonedMutexException) { acquired = true; }
            if (!acquired)
            {
                MessageBox.Show("这个文件夹中的系统已经启动，请切换到已打开的窗口。", Title);
                return 0;
            }
            try { return Launch(); }
            finally { mutex.ReleaseMutex(); }
        }
    }

    private static int Launch()
    {
        int result = 0;
        using (var status = new Form {
            Text = Title, ClientSize = new Size(408, 90), StartPosition = FormStartPosition.CenterScreen,
            ControlBox = false, FormBorderStyle = FormBorderStyle.FixedDialog
        })
        {
            var label = new Label { Left = 16, Top = 14, Width = 380, Text = "正在准备运行文件，首次打开需要一些时间…" };
            status.Controls.Add(label);
            status.Controls.Add(new ProgressBar { Left = 16, Top = 48, Width = 376, Style = ProgressBarStyle.Marquee });
            status.Shown += async delegate
            {
                try
                {
#if !INSTALLED
                    await Task.Run((Action)PrepareRuntime);
                    await Task.Run((Action)UpdateApplication);
#endif
                    var start = new ProcessStartInfo {
                        FileName = Path.Combine(BinaryFolder, @"runtime\node.exe"), Arguments = "bootstrap.mjs",
                        WorkingDirectory = Folder, UseShellExecute = false, CreateNoWindow = true
                    };
                    start.EnvironmentVariables.Remove("SCPC_PORTABLE_TEST_MODE");
                    start.EnvironmentVariables["SCPC_BINARY_FOLDER"] = BinaryFolder;
                    // The bootstrap creates the administrator only when the user table is empty.
                    using (var reader = new StreamReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("debug-admin-password")))
                        start.EnvironmentVariables["SCPC_INITIAL_PASSWORD"] = reader.ReadToEnd();
                    label.Text = "正在启动本机服务和桌面窗口…";
                    using (var process = Process.Start(start))
                    {
                        start.EnvironmentVariables.Remove("SCPC_INITIAL_PASSWORD");
                        status.Hide();
                        await Task.Run((Action)process.WaitForExit);
                        if (process.ExitCode != 0)
                            throw new InvalidOperationException("系统启动失败。请确认运行目录可写、空间充足，并保留原有 data 文件夹。");
                    }
                }
                catch (Exception error)
                {
                    result = 1;
                    MessageBox.Show(error.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                finally { status.Close(); }
            };
            Application.Run(status);
        }
        return result;
    }

#if !INSTALLED
    private static void ReplaceRuntimeFile(string destination, Stream contents)
    {
        var temp = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write))
                contents.CopyTo(file);
            File.Replace(temp, destination, null);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    private static void UpdateApplication()
    {
        var marker = Path.Combine(Folder, ".scpc-app.sha256");
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("project-app.zip"))
        using (var hash = SHA256.Create())
        {
            var version = BitConverter.ToString(hash.ComputeHash(stream));
            if (File.Exists(marker) && File.ReadAllText(marker) == version) return;
            stream.Position = 0;
            var api = Path.GetFullPath(Path.Combine(Folder, @"apps\api\dist")) + Path.DirectorySeparatorChar;
            var desktop = Path.GetFullPath(Path.Combine(Folder, @"client\resources\app\out")) + Path.DirectorySeparatorChar;
            using (var update = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                foreach (var entry in update.Entries)
                {
                    var file = Path.GetFullPath(Path.Combine(Folder, entry.FullName));
                    if (!file.StartsWith(api, StringComparison.OrdinalIgnoreCase) &&
                        !file.StartsWith(desktop, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("应用更新文件的目标路径无效。");
                    Directory.CreateDirectory(Path.GetDirectoryName(file));
                    entry.ExtractToFile(file, true);
                }
            }
            File.WriteAllText(marker, version);
        }
    }

    private static void PrepareRuntime()
    {
        var assembly = Assembly.GetExecutingAssembly();
        string expected;
        using (var reader = new StreamReader(assembly.GetManifestResourceStream("payload.sha256")))
            expected = reader.ReadToEnd().Trim();
        string version;
        using (var boot = assembly.GetManifestResourceStream("bootstrap.mjs"))
        using (var hash = SHA256.Create())
            version = expected + ":" + BitConverter.ToString(hash.ComputeHash(boot));
        const string stamp = ".scpc-payload.sha256";
        var marker = Path.Combine(Folder, stamp);
        var pending = Path.Combine(Folder, ".scpc-installing");
        if (Directory.Exists(Folder))
        {
            var installed = File.Exists(marker) ? File.ReadAllText(marker).Trim() : "";
            var bootstrap = Path.Combine(Folder, "bootstrap.mjs");
            if (installed.StartsWith(expected + ":", StringComparison.OrdinalIgnoreCase) &&
                File.Exists(Path.Combine(Folder, @"runtime\node.exe")) &&
                File.Exists(Path.Combine(Folder, @"client\SCPC.exe")) &&
                File.Exists(bootstrap))
            {
                if (installed == version) return;
                string onDisk;
                using (var file = File.OpenRead(bootstrap))
                using (var hash = SHA256.Create())
                    onDisk = expected + ":" + BitConverter.ToString(hash.ComputeHash(file));
                // An interrupted update may already have replaced the bootstrap but not its marker.
                if (onDisk == installed || onDisk == version)
                {
                    using (var boot = assembly.GetManifestResourceStream("bootstrap.mjs"))
                        ReplaceRuntimeFile(bootstrap, boot);
                    using (var stampBytes = new MemoryStream(Encoding.UTF8.GetBytes(version)))
                        ReplaceRuntimeFile(marker, stampBytes);
                    return;
                }
            }
            if (File.Exists(marker) ||
                (Directory.GetFileSystemEntries(Folder).Length != 0 &&
                 (!File.Exists(pending) || File.ReadAllText(pending).Trim() != version)))
                throw new IOException("旁边的 SCPC-便携版 目录属于其他版本或文件不完整。请将 EXE 放入新的可写文件夹再启动。原目录内的数据仍在。");
        }
        using (var payload = assembly.GetManifestResourceStream("payload.zip"))
        using (var hash = SHA256.Create())
        {
            var actual = BitConverter.ToString(hash.ComputeHash(payload)).Replace("-", "");
            if (!actual.Equals(expected, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("运行包校验失败，请重新获取完整的 EXE。");
            payload.Position = 0;
            Directory.CreateDirectory(Folder);
            File.WriteAllText(pending, version);
            string prefix = Path.GetFullPath(Folder) + Path.DirectorySeparatorChar;
            using (var zip = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                foreach (var entry in zip.Entries)
                {
                    var path = Path.GetFullPath(Path.Combine(Folder, entry.FullName));
                    if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("运行包包含无效的文件路径。");
                    if (entry.Name.Length == 0)
                        Directory.CreateDirectory(path);
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(path));
                        entry.ExtractToFile(path, true);
                    }
                }
            }
        }
        using (var boot = assembly.GetManifestResourceStream("bootstrap.mjs"))
        using (var file = File.Create(Path.Combine(Folder, "bootstrap.mjs")))
            boot.CopyTo(file);
        // Publish only the completion marker. Open handles on the runtime directory are harmless.
        File.Move(pending, marker);
    }
#endif
}
