#define UNICODE
#define _UNICODE
#include <windows.h>
#include <aclapi.h>
#include <msiquery.h>
#include <wchar.h>

/* Check the directory that will supply the executable's integrity label. */
static BOOL low_label(const wchar_t *path)
{
    PACL labels = NULL;
    PSECURITY_DESCRIPTOR descriptor = NULL;
    BOOL low = FALSE;
    if (GetNamedSecurityInfoW((LPWSTR)path, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION,
                              NULL, NULL, NULL, &labels, &descriptor) != ERROR_SUCCESS)
        return FALSE;
    for (DWORD i = 0; labels && i < labels->AceCount; ++i) {
        SYSTEM_MANDATORY_LABEL_ACE *ace;
        if (GetAce(labels, i, (void **)&ace) && ace->Header.AceType == SYSTEM_MANDATORY_LABEL_ACE_TYPE) {
            PSID sid = &ace->SidStart;
            if (IsValidSid(sid) && *GetSidSubAuthorityCount(sid) == 1 &&
                *GetSidSubAuthority(sid, 0) < SECURITY_MANDATORY_MEDIUM_RID)
                low = TRUE;
        }
    }
    LocalFree(descriptor);
    return low;
}

static BOOL restricted_folder(const wchar_t *folder)
{
    wchar_t path[32768];
    size_t len = wcslen(folder);
    if (!len || len + 10 >= ARRAYSIZE(path)) return FALSE;
    wcscpy(path, folder);
    if (path[len - 1] != L'\\') wcscat(path, L"\\");
    wcscat(path, L"SCPC.exe");
    if (low_label(path)) return TRUE;
    path[len] = L'\0';
    while (len > 3 && path[len - 1] == L'\\') path[--len] = L'\0';
    while (GetFileAttributesW(path) == INVALID_FILE_ATTRIBUTES) {
        wchar_t *slash = wcsrchr(path, L'\\');
        if (!slash || slash == path || (slash == path + 2 && path[1] == L'\\')) return FALSE;
        if (slash == path + 2 && path[1] == L':') { slash[1] = L'\0'; break; }
        *slash = L'\0';
    }
    return low_label(path);
}

__declspec(dllexport) UINT __stdcall ChoosePreviousFolder(MSIHANDLE install)
{
    wchar_t path[32768];
    DWORD size = ARRAYSIZE(path);
    if (MsiGetPropertyW(install, L"PREVIOUSINSTALLFOLDER", path, &size) == ERROR_SUCCESS &&
        size && !restricted_folder(path))
        return MsiSetPropertyW(install, L"INSTALLFOLDER", path);
    return ERROR_SUCCESS;
}

__declspec(dllexport) UINT __stdcall CheckInstallFolder(MSIHANDLE install)
{
    wchar_t path[32768];
    DWORD size = ARRAYSIZE(path);
    UINT result = MsiGetTargetPathW(install, L"INSTALLFOLDER", path, &size);
    if (result != ERROR_SUCCESS || !size) return ERROR_INSTALL_FAILURE;
    if (!restricted_folder(path)) return ERROR_SUCCESS;
    MSIHANDLE message = MsiCreateRecord(0);
    MsiRecordSetStringW(message, 0, L"Windows 将这个目录标记为低完整性，桌面程序无法从这里正常启动。请重新运行安装包，使用默认目录或选择其他普通目录。");
    MsiProcessMessage(install, INSTALLMESSAGE_ERROR, message);
    MsiCloseHandle(message);
    return ERROR_INSTALL_FAILURE;
}
