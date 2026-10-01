Request URL
https://empireenglish.schoolmate.eu/group/getlessonattendancedata
Request method
POST
Status code

payload:
```
{"groupId":116902,"lessonSearchModel":{"LessonFromDate":"2026-9-28","LessonToDate":"2026-10-2","IsShowSkippedDates":false,"IsShowDischarged":false,"LessonFilter":{"IsAddedClassesDetails":null,"IsAttendanceChecked":null,"IsOnline":null,"IsConflict":null,"IsClassesModified":null,"IsFilesAdded":null},"SchedularTypeId":0,"IsShowMyLessonOnly":false,"GroupId":0,"StrLessonFromDate":"","StrLessonToDate":"","IsAdmin":false,"IsSubstitute":false,"DateOfPayment":null,"RecordIds":null,"CalenderColorType":0,"FromDate":"2026-09-27T21:00:00.000Z","ToDate":"2026-10-01T21:00:00.000Z","StrFromDate":"","StrToDate":"","FacilityRoomId":0,"CompanyId":0,"CalendarUserId":0},"requestuserId":743140,"roleId":2}
```

response: 
```
{
    "IsSuccess": true,
    "Message": null,
    "Data": {
        "AttendanceHead": [
            {
                "GroupLessonId": 7901271,
                "LessonDate": "\/Date(1790578800000)\/",
                "LessonTime": "18:00-19:00",
                "AttendanceChecked": true,
                "GroupClassName": null,
                "HomeworkChecked": false,
                "StrLessonDate": "28/09/2026"
            },
            {
                "GroupLessonId": 7901272,
                "LessonDate": "\/Date(1790751600000)\/",
                "LessonTime": "18:00-19:00",
                "AttendanceChecked": true,
                "GroupClassName": null,
                "HomeworkChecked": false,
                "StrLessonDate": "30/09/2026"
            }
        ],
        "AttendanceStatusList": [
            {
                "AttendanceStatusId": 371,
                "SchoolId": 0,
                "AttendanceStatusName": "Absent",
                "AttendanceStatusColor": "#FF0000",
                "ShortName": "AB",
                "AttendanceFunctionId": 0,
                "StudentFeePercentage": null,
                "PercentageInAttendance": null,
                "DynamicId": null,
                "CreatedDate": "\/Date(-62135568000000)\/",
                "CreatedBy": 0,
                "UpdatedDate": null,
                "UpdatedBy": 0,
                "StrCreatedDate": "01/01/0001",
                "StrUpdatedDate": ""
            },
            {
                "AttendanceStatusId": 372,
                "SchoolId": 0,
                "AttendanceStatusName": "Late",
                "AttendanceStatusColor": "#99FF33",
                "ShortName": "LT",
                "AttendanceFunctionId": 0,
                "StudentFeePercentage": null,
                "PercentageInAttendance": null,
                "DynamicId": null,
                "CreatedDate": "\/Date(-62135568000000)\/",
                "CreatedBy": 0,
                "UpdatedDate": null,
                "UpdatedBy": 0,
                "StrCreatedDate": "01/01/0001",
                "StrUpdatedDate": ""
            }
        ],
        "StudentAttendanceList": [
            {
                "StudentId": 427476,
                "Name": "Nelichenko Sofiia",
                "AttendanceList": [
                    {
                        "AttendanceStatusIdStr": "0",
                        "LessonDate": "\/Date(1790578800000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": null,
                        "ShortName": null,
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "28/09/2026",
                        "AttendanceId": 0,
                        "StudentId": 427476,
                        "GroupLessonId": 7901271,
                        "AttendanceStatusId": 0
                    },
                    {
                        "AttendanceStatusIdStr": "371",
                        "LessonDate": "\/Date(1790751600000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": "#FF0000",
                        "ShortName": "AB",
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "30/09/2026",
                        "AttendanceId": 3153690,
                        "StudentId": 427476,
                        "GroupLessonId": 7901272,
                        "AttendanceStatusId": 371
                    }
                ]
            },
            {
                "StudentId": 417286,
                "Name": "Pereverziev Mykyta",
                "AttendanceList": [
                    {
                        "AttendanceStatusIdStr": "0",
                        "LessonDate": "\/Date(1790578800000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": null,
                        "ShortName": null,
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "28/09/2026",
                        "AttendanceId": 0,
                        "StudentId": 417286,
                        "GroupLessonId": 7901271,
                        "AttendanceStatusId": 0
                    },
                    {
                        "AttendanceStatusIdStr": "371",
                        "LessonDate": "\/Date(1790751600000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": "#FF0000",
                        "ShortName": "AB",
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "30/09/2026",
                        "AttendanceId": 3153691,
                        "StudentId": 417286,
                        "GroupLessonId": 7901272,
                        "AttendanceStatusId": 371
                    }
                ]
            },
            {
                "StudentId": 440985,
                "Name": "Vysrotopskia Valentyna",
                "AttendanceList": [
                    {
                        "AttendanceStatusIdStr": "0",
                        "LessonDate": "\/Date(1790578800000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": null,
                        "ShortName": null,
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "28/09/2026",
                        "AttendanceId": 0,
                        "StudentId": 440985,
                        "GroupLessonId": 7901271,
                        "AttendanceStatusId": 0
                    },
                    {
                        "AttendanceStatusIdStr": "0",
                        "LessonDate": "\/Date(1790751600000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": null,
                        "ShortName": null,
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "30/09/2026",
                        "AttendanceId": 0,
                        "StudentId": 440985,
                        "GroupLessonId": 7901272,
                        "AttendanceStatusId": 0
                    }
                ]
            },
            {
                "StudentId": 415507,
                "Name": "Yegorov Igor",
                "AttendanceList": [
                    {
                        "AttendanceStatusIdStr": "0",
                        "LessonDate": "\/Date(1790578800000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": null,
                        "ShortName": null,
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "28/09/2026",
                        "AttendanceId": 0,
                        "StudentId": 415507,
                        "GroupLessonId": 7901271,
                        "AttendanceStatusId": 0
                    },
                    {
                        "AttendanceStatusIdStr": "371",
                        "LessonDate": "\/Date(1790751600000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": "#FF0000",
                        "ShortName": "AB",
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "30/09/2026",
                        "AttendanceId": 3153692,
                        "StudentId": 415507,
                        "GroupLessonId": 7901272,
                        "AttendanceStatusId": 371
                    }
                ]
            },
            {
                "StudentId": 440381,
                "Name": "Островерх Андрій",
                "AttendanceList": [
                    {
                        "AttendanceStatusIdStr": "0",
                        "LessonDate": "\/Date(1790578800000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": null,
                        "ShortName": null,
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "28/09/2026",
                        "AttendanceId": 0,
                        "StudentId": 440381,
                        "GroupLessonId": 7901271,
                        "AttendanceStatusId": 0
                    },
                    {
                        "AttendanceStatusIdStr": "371",
                        "LessonDate": "\/Date(1790751600000)\/",
                        "LessonFromTime": {
                            "Ticks": 648000000000,
                            "Days": 0,
                            "Hours": 18,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.75,
                            "TotalHours": 18,
                            "TotalMilliseconds": 64800000,
                            "TotalMinutes": 1080,
                            "TotalSeconds": 64800
                        },
                        "LessonToTime": {
                            "Ticks": 684000000000,
                            "Days": 0,
                            "Hours": 19,
                            "Milliseconds": 0,
                            "Minutes": 0,
                            "Seconds": 0,
                            "TotalDays": 0.79166666666666663,
                            "TotalHours": 19,
                            "TotalMilliseconds": 68400000,
                            "TotalMinutes": 1140,
                            "TotalSeconds": 68400
                        },
                        "AttendanceStatusColor": "#FF0000",
                        "ShortName": "AB",
                        "AttendanceChecked": true,
                        "Name": null,
                        "AttendanceFunctionId": 0,
                        "HomeworkChecked": false,
                        "NoHomework": false,
                        "IsStudentAttend": true,
                        "IsDischarge": false,
                        "StrLessonDate": "30/09/2026",
                        "AttendanceId": 3153693,
                        "StudentId": 440381,
                        "GroupLessonId": 7901272,
                        "AttendanceStatusId": 371
                    }
                ]
            }
        ],
        "AttendanceList": null,
        "SchoolDateFormat": "dd/MM/yyyy"
    }
}
```