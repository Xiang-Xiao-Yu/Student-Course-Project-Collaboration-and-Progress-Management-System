"""Build the per-user Windows installer from the verified single-file distribution."""

import argparse
import hashlib
import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import uuid
import xml.etree.ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
NAME = "学生课程项目协作与进度管理系统"
UPGRADE = uuid.UUID("b03ae35d-7f28-457a-9148-24a144bbc671")
NS = "http://schemas.microsoft.com/wix/2006/wi"


def identifier(kind, path):
    return kind + hashlib.sha256(path.encode("utf-8")).hexdigest()[:24]


def unpack(portable, stage):
    # Use the actual resources of the tested release, never an installed user's directory.
    env = dict(os.environ, SCPC_INPUT=str(portable), SCPC_STAGE=str(stage))
    script = """
    $ErrorActionPreference='Stop'
    $a=[Reflection.Assembly]::ReflectionOnlyLoadFrom($env:SCPC_INPUT)
    foreach($n in @('payload.zip','payload.sha256','project-app.zip','bootstrap.mjs','debug-admin-password')){
        $s=$a.GetManifestResourceStream($n)
        if(!$s){throw "Missing resource: $n"}
        $f=[IO.File]::Create((Join-Path $env:SCPC_STAGE $n))
        try{$s.CopyTo($f)}finally{$f.Dispose();$s.Dispose()}
    }
    """
    subprocess.run(["powershell.exe", "-NoProfile", "-Command", script], env=env, check=True)
    payload = stage / "payload.zip"
    with payload.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != (stage / "payload.sha256").read_text().strip().lower():
        raise ValueError("Embedded base ZIP checksum mismatch")
    app = stage / "app"
    app.mkdir()
    with ZipFile(payload) as archive:
        for item in archive.infolist():
            name = item.filename.replace("\\", "/")
            if name.split("/")[0] in {"apps", "client", "runtime", "runtime-packages.json"}:
                archive.extract(item, app)
    with ZipFile(stage / "project-app.zip") as archive:
        for item in archive.infolist():
            if not item.filename.startswith(("apps/api/dist/", "client/resources/app/out/")):
                raise ValueError("Unexpected application update path")
            archive.extract(item, app)
    # The installed launcher and its bootstrap use the same MSI-specific runtime layout.
    shutil.copyfile(ROOT / "scripts/portable/bootstrap.mjs", app / "bootstrap.mjs")
    return app


def write_wix(stage, app, version):
    ET.register_namespace("", NS)
    root = ET.Element("Wix", xmlns=NS)
    element = ET.SubElement
    product = element(root, "Product", Id=str(uuid.uuid5(UPGRADE, version)), Name=NAME,
                      Manufacturer="SCPC 课程项目组", Language="2052", Codepage="936",
                      Version=version, UpgradeCode=str(UPGRADE))
    element(product, "Package", InstallerVersion="500", Compressed="yes",
            InstallScope="perUser", InstallPrivileges="limited", SummaryCodepage="936")
    element(product, "MajorUpgrade", Schedule="afterInstallInitialize",
            DowngradeErrorMessage="已经安装了更新版本。")
    element(product, "MediaTemplate", EmbedCab="yes", CompressionLevel="medium")
    element(product, "Property", Id="INSTALLFOLDER", Secure="yes")
    install_path = element(product, "Property", Id="PREVIOUSINSTALLFOLDER", Secure="yes")
    element(install_path, "RegistrySearch", Id="PreviousInstallFolder", Root="HKCU",
            Key=r"Software\SCPC\Installer", Name="InstallFolder", Type="raw", Win64="yes")
    element(product, "Binary", Id="FolderChecks", SourceFile=str(stage / "InstallFolder.dll"))
    for action in ("ChoosePreviousFolder", "CheckInstallFolder"):
        element(product, "CustomAction", Id=action, BinaryKey="FolderChecks", DllEntry=action,
                Execute="immediate", Return="check")
    for sequence in ("InstallUISequence", "InstallExecuteSequence"):
        actions = element(product, sequence)
        element(actions, "Custom", Action="ChoosePreviousFolder", After="AppSearch").text = (
            "NOT Installed AND NOT INSTALLFOLDER AND PREVIOUSINSTALLFOLDER")
        if sequence == "InstallExecuteSequence":
            element(actions, "Custom", Action="CheckInstallFolder", Before="InstallValidate").text = (
                'NOT (REMOVE~="ALL")')
    top = element(product, "Directory", Id="TARGETDIR", Name="SourceDir")
    local = element(top, "Directory", Id="LocalAppDataFolder")
    install = element(local, "Directory", Id="INSTALLFOLDER", Name="SCPC")
    binaries = element(local, "Directory", Id="RUNTIMEFOLDER", Name="SCPC.DesktopRuntime")
    start_menu = element(top, "Directory", Id="ProgramMenuFolder")
    desktop = element(top, "Directory", Id="DesktopFolder")
    feature = element(product, "Feature", Id="Application", Title=NAME, Level="1")
    dirs = {".": install}
    for path, subdirs, filenames in os.walk(app):
        subdirs.sort()
        directory = Path(path)
        rel = directory.relative_to(app).as_posix()
        node = dirs[rel]
        for subdir in subdirs:
            child = (directory / subdir).relative_to(app).as_posix()
            parent = binaries if child in {"client", "runtime"} else node
            dirs[child] = element(parent, "Directory", Id=identifier("D", child), Name=subdir)
        component_id = identifier("C", rel)
        prefix = "runtime-dir/" if rel.split("/")[0] in {"client", "runtime"} else "dir/"
        comp = element(node, "Component", Id=component_id, Win64="yes",
                       Guid=str(uuid.uuid5(UPGRADE, prefix + rel)))
        element(comp, "RegistryValue", Root="HKCU", Key=r"Software\SCPC\Installer\Components",
                Name=component_id, Type="integer", Value="1", KeyPath="yes")
        if rel == ".":
            element(comp, "RemoveFolder", Id="RemoveRuntimeHome", Directory="RUNTIMEFOLDER", On="uninstall")
            element(comp, "RegistryValue", Root="HKCU", Key=r"Software\SCPC\Installer",
                    Name="InstallFolder", Type="string", Value="[INSTALLFOLDER]")
        element(comp, "RemoveFolder", Id=identifier("R", rel), On="uninstall")
        element(feature, "ComponentRef", Id=component_id)
        for filename in sorted(filenames):
            file = directory / filename
            key = file.relative_to(app).as_posix()
            element(comp, "File", Id=identifier("F", key), Source=str(file), Name=filename)
    host = element(binaries, "Component", Id="DesktopHost", Win64="yes",
                   Guid=str(uuid.uuid5(UPGRADE, "runtime/scpc-host-exe")))
    element(host, "File", Id="DesktopHostExe", Name="SCPC.Host.exe", Source=str(stage / "SCPC.Host.exe"))
    element(host, "RegistryValue", Root="HKCU", Key=r"Software\SCPC\Installer",
            Name="DesktopHost", Type="integer", Value="1", KeyPath="yes")
    element(feature, "ComponentRef", Id="DesktopHost")
    for location, key in [(start_menu, "StartMenu"), (desktop, "Desktop")]:
        comp = element(location, "Component", Id=key+"Link", Win64="yes",
                       Guid=str(uuid.uuid5(UPGRADE, "shortcut/" + key)))
        element(comp, "Shortcut", Id=key+"Shortcut", Name=NAME, Target="[INSTALLFOLDER]SCPC.exe",
                WorkingDirectory="INSTALLFOLDER")
        element(comp, "RegistryValue", Root="HKCU", Key=r"Software\SCPC\Installer",
                Name=key+"Link", Type="integer", Value="1", KeyPath="yes")
        element(feature, "ComponentRef", Id=key+"Link")
    element(product, "Property", Id="WIXUI_INSTALLDIR", Value="INSTALLFOLDER")
    element(product, "UIRef", Id="WixUI_InstallDir")
    ui = element(product, "UI")
    for dialog, control, target in [("WelcomeDlg", "Next", "InstallDirDlg"),
                                    ("InstallDirDlg", "Back", "WelcomeDlg")]:
        event = element(ui, "Publish", Dialog=dialog, Control=control, Event="NewDialog",
                        Value=target, Order="10")
        event.text = "NOT Installed"
    wxs = stage / "scpc.wxs"
    ET.ElementTree(root).write(wxs, encoding="utf-8", xml_declaration=True)
    return wxs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("portable", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--version", default="0.1.10")
    parser.add_argument("--wix", type=Path,
                        default=Path(os.environ["LOCALAPPDATA"]) / "tauri/WixTools314")
    args = parser.parse_args()
    portable, output = args.portable.resolve(strict=True), args.output.resolve()
    if output.exists():
        raise FileExistsError(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix="scpc-msi-"))
    app = unpack(portable, stage)
    compiler = Path(os.environ["WINDIR"]) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
    credential = stage / "debug-admin-password"
    try:
        subprocess.run([compiler, "/nologo", "/target:winexe", "/define:INSTALLED", "/platform:x64",
                        "/optimize+", "/codepage:65001", "/out:" + str(stage / "SCPC.Host.exe"),
                        "/resource:" + str(credential) + ",debug-admin-password",
                        "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll",
                        "/reference:System.IO.Compression.dll", ROOT / "scripts/standalone/Launcher.cs"], check=True)
    finally:
        credential.unlink(missing_ok=True)
    subprocess.run(["x86_64-w64-mingw32-gcc", "-shared", "-Os", "-Wall", "-Werror", "-static-libgcc",
                    "-o", stage / "InstallFolder.dll", ROOT / "scripts/installer/InstallFolder.c",
                    "-lmsi", "-ladvapi32"], check=True)
    subprocess.run([compiler, "/nologo", "/target:winexe", "/platform:x64", "/optimize+",
                    "/codepage:65001", "/out:" + str(app / "SCPC.exe"),
                    "/reference:System.Windows.Forms.dll", ROOT / "scripts/installer/EntryPoint.cs"], check=True)
    wxs = write_wix(stage, app, args.version)
    obj = stage / "scpc.wixobj"
    subprocess.run([args.wix / "candle.exe", "-nologo", "-arch", "x64", "-out", obj, wxs], check=True)
    # ICE91 applies to packages intended to support per-machine installation as well.
    subprocess.run([args.wix / "light.exe", "-nologo", "-spdb", "-sice:ICE91", "-ext", "WixUIExtension",
                    "-cultures:zh-cn", "-out", output, obj], cwd=stage, check=True)
    print(f"{output}: {output.stat().st_size} bytes; SCPC.exe: {(app/'SCPC.exe').stat().st_size} bytes")


if __name__ == "__main__":
    main()
