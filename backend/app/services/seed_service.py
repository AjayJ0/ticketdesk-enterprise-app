import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.logging_config import logger
from app.core.security import get_password_hash
from app.models.organization import Department, Role, SupportTeam
from app.models.system import AuditLog, KnowledgeArticle, Notification, SystemSetting
from app.models.ticket import (
    SLAPolicy,
    Ticket,
    TicketAttachment,
    TicketCategory,
    TicketComment,
    TicketHistory,
)
from app.models.user import User


def seed_database(db: Session) -> None:
    """Idempotent enterprise database seeder for TicketDesk Enterprise."""
    if db.query(Role).count() > 0:
        logger.info("Database already seeded — skipping initial seed.")
        return

    logger.info("Seeding TicketDesk Enterprise database with realistic enterprise data...")
    now = datetime.now(timezone.utc)

    # 1. Roles
    role_admin = Role(
        name="admin",
        display_name="IT Administrator",
        description="Full administrative access to users, SLA policies, audit logs, and enterprise settings.",
    )
    role_agent = Role(
        name="agent",
        display_name="IT Support Agent",
        description="Operational access to ticket queues, incident resolution, SLA tracking, and knowledge base.",
    )
    role_employee = Role(
        name="employee",
        display_name="Employee",
        description="Standard corporate user able to submit tickets, upload attachments, and track requests.",
    )
    db.add_all([role_admin, role_agent, role_employee])
    db.flush()

    # 2. Departments
    departments_data = [
        ("Engineering & Product", "ENG", "Core software engineering and product development", "San Francisco HQ - Floor 4"),
        ("Finance & Accounting", "FIN", "Corporate finance, payroll, and treasury operations", "New York - Floor 12"),
        ("Human Resources", "HR", "People operations, talent acquisition, and onboarding", "San Francisco HQ - Floor 2"),
        ("Enterprise Sales", "SALES", "Global account executives and revenue operations", "Chicago - Floor 8"),
        ("Operations & Supply Chain", "OPS", "Global facilities, procurement, and logistics", "Austin - Building B"),
        ("Legal & Compliance", "LEGAL", "Corporate governance, privacy, and regulatory affairs", "New York - Floor 14"),
        ("Information Technology", "IT", "Enterprise IT Service Management & Security Operations", "San Francisco HQ - Floor 5"),
    ]
    dept_map: dict[str, Department] = {}
    for name, code, desc, loc in departments_data:
        d = Department(name=name, code=code, description=desc, location=loc, is_active=True)
        db.add(d)
        dept_map[code] = d
    db.flush()

    # 3. Support Teams
    teams_data = [
        ("Infrastructure & Network Ops", "NETOPS", "VPN, Wi-Fi, firewalls, DNS, and cloud connectivity", "Network & Cloud"),
        ("Workplace & Endpoint Engineering", "ENDPOINT", "Corporate laptops, peripherals, OS imaging, and MDM", "Hardware & OS"),
        ("Identity & Access Governance", "IAM", "Active Directory, SSO/Okta, MFA, and role provisioning", "Identity & Security"),
        ("Enterprise Business Applications", "BIZAPPS", "ERP, CRM, Slack, Jira, Microsoft 365, and SaaS licensing", "Enterprise Software"),
    ]
    team_map: dict[str, SupportTeam] = {}
    for name, code, desc, spec in teams_data:
        t = SupportTeam(name=name, code=code, description=desc, specialization=spec, is_active=True)
        db.add(t)
        team_map[code] = t
    db.flush()

    # 4. Users (1 Admin, 3 IT Support Agents, 11 Employees)
    admin_hash = get_password_hash("Admin@12345")
    agent_hash = get_password_hash("Agent@12345")
    emp_hash = get_password_hash("Employee@12345")

    admin_user = User(
        email="admin@ticketdesk.enterprise",
        full_name="Evelyn Sterling",
        employee_id="EMP-1001",
        job_title="Director of Enterprise IT & ITSM",
        phone="+1 (415) 890-1001",
        hashed_password=admin_hash,
        is_active=True,
        role_id=role_admin.id,
        department_id=dept_map["IT"].id,
        support_team_id=team_map["IAM"].id,
        last_login_at=now - timedelta(hours=1),
        created_at=now - timedelta(days=90),
    )
    db.add(admin_user)

    agents_spec = [
        ("alex.rivera@ticketdesk.enterprise", "Alex Rivera", "EMP-1010", "Senior Network & Cloud Support Engineer", "+1 (415) 890-1010", "NETOPS"),
        ("priya.nair@ticketdesk.enterprise", "Priya Nair", "EMP-1011", "Identity & Security Systems Specialist", "+1 (415) 890-1011", "IAM"),
        ("marcus.vance@ticketdesk.enterprise", "Marcus Vance", "EMP-1012", "Lead Workplace & Endpoint Engineer", "+1 (415) 890-1012", "ENDPOINT"),
    ]
    agents: list[User] = []
    for email, name, emp_id, title, phone, team_code in agents_spec:
        ag = User(
            email=email,
            full_name=name,
            employee_id=emp_id,
            job_title=title,
            phone=phone,
            hashed_password=agent_hash,
            is_active=True,
            role_id=role_agent.id,
            department_id=dept_map["IT"].id,
            support_team_id=team_map[team_code].id,
            last_login_at=now - timedelta(hours=2),
            created_at=now - timedelta(days=80),
        )
        db.add(ag)
        agents.append(ag)

    employees_spec = [
        ("sarah.chen@ticketdesk.enterprise", "Sarah Chen", "EMP-2001", "Staff Backend Engineer", "ENG", "+1 (415) 890-2001"),
        ("david.miller@ticketdesk.enterprise", "David Miller", "EMP-2002", "Senior Financial Analyst", "FIN", "+1 (212) 555-2002"),
        ("elena.rodriguez@ticketdesk.enterprise", "Elena Rodriguez", "EMP-2003", "HR Business Partner", "HR", "+1 (415) 890-2003"),
        ("james.wilson@ticketdesk.enterprise", "James Wilson", "EMP-2004", "Regional Sales Director", "SALES", "+1 (312) 555-2004"),
        ("olivia.thompson@ticketdesk.enterprise", "Olivia Thompson", "EMP-2005", "Supply Chain Coordinator", "OPS", "+1 (512) 555-2005"),
        ("daniel.kim@ticketdesk.enterprise", "Daniel Kim", "EMP-2006", "Frontend Architect", "ENG", "+1 (415) 890-2006"),
        ("sophia.patel@ticketdesk.enterprise", "Sophia Patel", "EMP-2007", "Corporate Counsel", "LEGAL", "+1 (212) 555-2007"),
        ("michael.okafor@ticketdesk.enterprise", "Michael Okafor", "EMP-2008", "DevOps Platform Engineer", "ENG", "+1 (415) 890-2008"),
        ("hannah.abbott@ticketdesk.enterprise", "Hannah Abbott", "EMP-2009", "Payroll Specialist", "FIN", "+1 (212) 555-2009"),
        ("lucas.moreau@ticketdesk.enterprise", "Lucas Moreau", "EMP-2010", "Enterprise Account Executive", "SALES", "+1 (312) 555-2010"),
        ("chloe.bennett@ticketdesk.enterprise", "Chloe Bennett", "EMP-2011", "Operations Analyst", "OPS", "+1 (512) 555-2011"),
    ]
    employees: list[User] = []
    for email, name, emp_id, title, dept_code, phone in employees_spec:
        emp = User(
            email=email,
            full_name=name,
            employee_id=emp_id,
            job_title=title,
            phone=phone,
            hashed_password=emp_hash,
            is_active=True,
            role_id=role_employee.id,
            department_id=dept_map[dept_code].id,
            last_login_at=now - timedelta(hours=5),
            created_at=now - timedelta(days=60),
        )
        db.add(emp)
        employees.append(emp)
    db.flush()

    # 5. Ticket Categories
    categories_spec = [
        (
            "Hardware",
            "hardware",
            "Workstations, MacBook/ThinkPad laptops, docking stations, monitors, and peripherals",
            ["Laptop / Workstation", "Monitor / Display", "Docking Station", "Keyboard & Mouse", "Mobile Device", "Printer / Scanner"],
            "Laptop",
        ),
        (
            "Software",
            "software",
            "Enterprise SaaS applications, IDE licenses, productivity suites, and OS upgrades",
            ["Microsoft 365 / Outlook", "Slack / Collaboration", "IDE & Developer Tools", "Zoom / Conferencing", "OS Crash / Update", "License Provisioning"],
            "AppWindow",
        ),
        (
            "Network",
            "network",
            "Corporate VPN, office Wi-Fi, DNS resolution, firewall rules, and cloud VPC peering",
            ["VPN Connectivity", "Corporate Wi-Fi (802.1X)", "LAN / Ethernet Port", "DNS / Internal Routing", "Cloud VPC / AWS Direct Connect"],
            "Wifi",
        ),
        (
            "Access",
            "access",
            "Single Sign-On (Okta), Active Directory passwords, RBAC permissions, and database access",
            ["SSO / Okta Lockout", "MFA Hardware Token / Reset", "GitHub / AWS IAM Role", "Shared Drive / SharePoint", "New Hire Onboarding Access"],
            "KeyRound",
        ),
        (
            "Security",
            "security",
            "Phishing reports, endpoint antivirus alerts, lost device lockdown, and DLP policies",
            ["Suspicious Email / Phishing", "CrowdStrike Endpoint Alert", "Lost or Stolen Device", "Certificate Expiration", "USB / DLP Exception"],
            "ShieldAlert",
        ),
        (
            "Other",
            "other",
            "General IT inquiries, audio/visual conference room support, and facility badge requests",
            ["Conference Room A/V", "Desk Relocation Setup", "IT Policy Inquiry", "General Consultation"],
            "HelpCircle",
        ),
    ]
    cat_map: dict[str, TicketCategory] = {}
    for name, slug, desc, subs, icon in categories_spec:
        c = TicketCategory(
            name=name,
            slug=slug,
            description=desc,
            subcategories_json=json.dumps(subs),
            icon=icon,
            is_active=True,
        )
        db.add(c)
        cat_map[slug] = c
    db.flush()

    # 6. SLA Policies (Section 11 requirements)
    sla_specs = [
        ("Critical Incident SLA (P1)", "critical", 15, 240, False, "15-minute initial response and 4-hour resolution target for critical production or executive blockers."),
        ("High Priority SLA (P2)", "high", 60, 480, False, "1-hour initial response and 8-hour resolution target for severe degradation impacting work."),
        ("Medium Priority SLA (P3)", "medium", 240, 1440, True, "4-hour initial response and 24-hour resolution target for standard single-user technical issues."),
        ("Low Priority SLA (P4)", "low", 480, 2880, True, "8-hour initial response and 48-hour resolution target for routine requests and minor inquiries."),
    ]
    sla_map: dict[str, SLAPolicy] = {}
    for name, prio, resp_m, res_m, bh_only, desc in sla_specs:
        pol = SLAPolicy(
            name=name,
            priority=prio,
            response_target_minutes=resp_m,
            resolution_target_minutes=res_m,
            business_hours_only=bh_only,
            description=desc,
            is_active=True,
        )
        db.add(pol)
        sla_map[prio] = pol
    db.flush()

    # 7. Seed 28 Realistic Enterprise Tickets
    # Fields: (seq, days_ago, hours_ago, subject, desc, cat_slug, subcat, priority, status, emp_idx, agent_idx, team_code, service, res_hours, breached)
    tickets_seed = [
        (1, 18, 4, "GlobalProtect VPN failing with Gateway TLS Handshake timeout", "After upgrading macOS to 15.1, GlobalProtect VPN hangs at 'Connecting' and returns a TLS certificate verification error when connecting to us-west-gw.corp.ticketdesk.enterprise.", "network", "VPN Connectivity", "high", "resolved", 0, 0, "NETOPS", "Palo Alto GlobalProtect VPN", 3.5, False),
        (2, 16, 2, "Okta MFA hardware YubiKey reset required after device replacement", "I switched to a new iPhone and lost my Okta Verify push registration. Need temporary bypass code and MFA factor reset for my corporate identity.", "access", "MFA Hardware Token / Reset", "high", "closed", 1, 1, "IAM", "Okta Enterprise SSO", 1.2, False),
        (3, 15, 6, "MacBook Pro M3 Max external dual 4K display flickering on CalDigit TS4 dock", "My secondary Dell UltraSharp 27 monitor intermittently blanks out every 15 minutes when connected via Thunderbolt 4 dock. Already swapped DisplayPort cables.", "hardware", "Docking Station", "medium", "resolved", 5, 2, "ENDPOINT", "Corporate MacBook Pro 16", 9.0, False),
        (4, 14, 1, "Request read-only IAM role for AWS Staging RDS PostgreSQL cluster", "Need read-only access to the `staging-analytics-rds` cluster in AWS account `td-staging-02` to debug payment reconciliation queries.", "access", "GitHub / AWS IAM Role", "medium", "closed", 7, 1, "IAM", "AWS IAM / RDS Staging", 6.5, False),
        (5, 13, 3, "Suspicious DocuSign invoice email claiming urgent wire transfer from CFO", "Received an external email from `cfo-office@ticketdesk-billing.com` with an encrypted PDF link. Forwarding headers for SOC inspection.", "security", "Suspicious Email / Phishing", "critical", "resolved", 8, 1, "IAM", "Proofpoint Email Gateway", 0.8, False),
        (6, 12, 5, "NetSuite ERP session timing out during Q3 financial close batch export", "Exporting general ledger CSV batches larger than 50,000 rows in NetSuite triggers a 504 Gateway Timeout through the corporate proxy.", "software", "Microsoft 365 / Outlook", "high", "resolved", 1, 0, "BIZAPPS", "Oracle NetSuite ERP", 5.2, False),
        (7, 11, 2, "San Francisco Floor 4 East Wing Wi-Fi (Corp-Secure) dropping packets", "Multiple engineers near conference room Sequoia are experiencing 35% packet loss and >400ms latency on the `TicketDesk-Corp-802.1X` SSID.", "network", "Corporate Wi-Fi (802.1X)", "critical", "resolved", 0, 0, "NETOPS", "Cisco Meraki Wireless LAN", 2.4, False),
        (8, 10, 4, "JetBrains IntelliJ IDEA Ultimate license server token expired", "Our team floating license server at `licenses.internal.ticketdesk.enterprise` is rejecting activation requests for IntelliJ 2026.2.", "software", "IDE & Developer Tools", "medium", "resolved", 5, 2, "BIZAPPS", "JetBrains License Server", 11.0, False),
        (9, 9, 6, "New hire onboarding equipment & SSO provisioning for Senior Product Designer", "New hire starting Monday in San Francisco HQ. Needs 16-inch MacBook Pro, Figma Enterprise seat, Slack, and Okta Engineering group access.", "access", "New Hire Onboarding Access", "medium", "closed", 2, 2, "ENDPOINT", "Employee Onboarding Bundle", 18.0, False),
        (10, 8, 3, "CrowdStrike Falcon sensor blocking local Docker build daemon on Windows 11", "CrowdStrike Falcon quarantined `com.docker.backend.exe` during a multi-stage container build. Need path exclusion verified by Security.", "security", "CrowdStrike Endpoint Alert", "high", "resolved", 7, 1, "IAM", "CrowdStrike FalconEDR", 4.1, False),
        (11, 7, 5, "Zoom Room tablet controller disconnected in Boardroom Horizon (NY 12F)", "The iPad controller in the New York 12th Floor Executive Boardroom shows 'Unable to pair with Mac Mini room appliance' before our 2 PM client pitch.", "other", "Conference Room A/V", "high", "resolved", 3, 2, "ENDPOINT", "Zoom Rooms A/V Appliance", 1.5, False),
        (12, 6, 2, "SharePoint Legal Contracts library permission denied for external counsel folder", "Unable to upload redlined MSA documents into the `/Legal/2026-Enterprise-Vendors` SharePoint site despite being in the Legal Counsel AD group.", "access", "Shared Drive / SharePoint", "medium", "resolved", 6, 1, "IAM", "Microsoft SharePoint Online", 7.5, False),
        (13, 5, 4, "ThinkPad X1 Carbon Gen 11 battery swollen and trackpad clicking stiff", "Noticed the bottom chassis of my ThinkPad is slightly raised near the palm rest and the battery drains from 80% to 10% in 25 minutes.", "hardware", "Laptop / Workstation", "high", "resolved", 4, 2, "ENDPOINT", "Lenovo ThinkPad X1 Carbon", 6.0, False),
        (14, 4, 7, "DNS resolution failure for internal `.corp.ticketdesk.enterprise` microservices", "CoreDNS forwarder in the Austin office subnet is returning NXDOMAIN for internal staging endpoints while external internet works fine.", "network", "DNS / Internal Routing", "critical", "resolved", 10, 0, "NETOPS", "Internal Split-Horizon DNS", 5.0, True),
        (15, 4, 2, "Outlook desktop client stuck on 'Updating Inbox' for shared Payroll mailbox", "The shared mailbox `payroll-ops@ticketdesk.enterprise` has not synced new messages since yesterday afternoon in Outlook 365.", "software", "Microsoft 365 / Outlook", "medium", "resolved", 8, 2, "BIZAPPS", "Exchange Online / Outlook", 8.0, False),
        (16, 3, 5, "Salesforce SSO SAML assertion error for EMEA & North America Sales reps", "Several Account Executives receive `SAML_RESPONSE_INVALID` when launching Salesforce Lightning from the Okta dashboard.", "access", "SSO / Okta Lockout", "critical", "resolved", 9, 1, "IAM", "Salesforce CRM / Okta SAML", 1.8, False),
        (17, 3, 1, "Requesting Adobe Acrobat Pro DC license for contract redlining", "Need full Adobe Acrobat Pro license assigned to my corporate Adobe ID to sign and redact vendor compliance schedules.", "software", "License Provisioning", "low", "resolved", 6, 2, "BIZAPPS", "Adobe Creative Cloud", 22.0, False),
        (18, 2, 6, "AWS Direct Connect BGP session flapping between us-east-1 and NY Core Router", "Observing intermittent BGP route reconvergence every 40 minutes between our NY colocation router and AWS Direct Connect VIF.", "network", "Cloud VPC / AWS Direct Connect", "critical", "in_progress", 7, 0, "NETOPS", "AWS Direct Connect / Core WAN", None, True),
        (19, 2, 3, "Replacement ergonomic wireless keyboard and vertical mouse request", "My Logitech MX Keys spacebar is sticking after 3 years of daily use. Requesting replacement peripheral kit at SF HQ desk 4-118.", "hardware", "Keyboard & Mouse", "low", "assigned", 0, 2, "ENDPOINT", "Workplace Peripherals", None, False),
        (20, 1, 18, "Production CI/CD GitHub Actions runner unable to pull from private ECR registry", "Self-hosted runner group `eng-prod-runners` fails with `403 Forbidden` when assuming the ECR pull IAM role during deployment pipelines.", "access", "GitHub / AWS IAM Role", "high", "in_progress", 0, 1, "IAM", "GitHub Enterprise & AWS ECR", None, True),
        (21, 1, 9, "Encrypted USB storage exception for regulatory audit archive delivery", "External auditors require a BitLocker-encrypted hardware USB drive containing Q4 SOX compliance evidence. Currently blocked by endpoint DLP.", "security", "USB / DLP Exception", "medium", "pending", 1, 1, "IAM", "Symantec Endpoint DLP", None, False),
        (22, 1, 5, "Slack desktop app high memory usage (>6 GB RAM) after Huddle screen share", "Slack 4.41 on macOS consumes over 6.5 GB RAM and freezes system audio whenever screen sharing in an engineering huddle.", "software", "Slack / Collaboration", "medium", "in_progress", 5, 2, "BIZAPPS", "Slack Enterprise Grid", None, False),
        (23, 0, 14, "Ethernet wall port A4-092 in Austin Logistics hub showing no link light", "Moved to desk A4-092 in Austin Building B; the wired RJ45 port has no PoE or link light when connected to dock.", "network", "LAN / Ethernet Port", "low", "assigned", 4, 0, "NETOPS", "Cisco Catalyst Switch Access Port", None, False),
        (24, 0, 7, "Workday HR portal permission update for Q4 performance review cycle", "Need 'Talent Calibrator' role enabled in Workday for HR Business Partners ahead of Friday's executive review.", "access", "SSO / Okta Lockout", "high", "in_progress", 2, 1, "IAM", "Workday HCM", None, False),
        (25, 0, 5, "4th Floor Canon imageRUNNER network printer jamming on Tray 2", "Printer `SF-4F-PRINT02` displays error code E0007-0001 and paper jam indicator even after clearing the duplex unit.", "hardware", "Printer / Scanner", "low", "open", 10, None, "ENDPOINT", "Canon Enterprise Print Server", None, False),
        (26, 0, 3, "Tableau Desktop license activation and Snowflake ODBC driver configuration", "Need Tableau Desktop 2026 installed with pre-configured Okta OAuth connection to the enterprise Snowflake warehouse.", "software", "License Provisioning", "medium", "open", 3, None, "BIZAPPS", "Tableau & Snowflake BI", None, False),
        (27, 0, 2, "VPN split-tunnel routing blocking access to internal Jira Data Center", "When connected to GlobalProtect VPN from home fiber, `jira.internal.ticketdesk.enterprise` times out while GitLab works.", "network", "VPN Connectivity", "high", "assigned", 0, 0, "NETOPS", "GlobalProtect VPN & Jira", None, False),
        (28, 0, 1, "Urgent: Executive laptop BitLocker recovery key prompt after BIOS update", "VP of Sales laptop rebooted into a blue BitLocker Recovery Key screen at Chicago O'Hare airport lounge before client flight.", "security", "Lost or Stolen Device", "critical", "open", 9, None, "ENDPOINT", "Microsoft Intune / BitLocker", None, True),
    ]

    created_tickets: list[Ticket] = []
    for (
        seq,
        d_ago,
        h_ago,
        subj,
        desc,
        cat_slug,
        subcat,
        prio,
        st,
        emp_idx,
        agent_idx,
        team_code,
        service,
        res_hours,
        breached,
    ) in tickets_seed:
        created_dt = now - timedelta(days=d_ago, hours=h_ago)
        requester = employees[emp_idx % len(employees)]
        assignee = agents[agent_idx] if agent_idx is not None else None
        pol = sla_map[prio]

        first_resp_due = created_dt + timedelta(minutes=pol.response_target_minutes)
        res_due = created_dt + timedelta(minutes=pol.resolution_target_minutes)

        first_resp_at = None
        resolved_at = None
        closed_at = None

        if assignee or st != "open":
            first_resp_at = created_dt + timedelta(minutes=min(pol.response_target_minutes - 3, 25))
        if res_hours is not None:
            resolved_at = created_dt + timedelta(hours=res_hours)
            if st == "closed":
                closed_at = resolved_at + timedelta(hours=4)

        if breached and st not in ("resolved", "closed"):
            # Force resolution_due_at into the past so it is genuinely overdue right now
            res_due = now - timedelta(minutes=45)

        t = Ticket(
            ticket_number=f"TKT-{now.year}-{seq:04d}",
            subject=subj,
            description=desc,
            category_id=cat_map[cat_slug].id,
            subcategory=subcat,
            priority=prio,
            status=st,
            requester_id=requester.id,
            assigned_agent_id=assignee.id if assignee else None,
            department_id=requester.department_id,
            support_team_id=team_map[team_code].id,
            affected_service=service,
            sla_policy_id=pol.id,
            sla_started_at=created_dt,
            first_response_due_at=first_resp_due,
            first_responded_at=first_resp_at,
            resolution_due_at=res_due,
            resolved_at=resolved_at,
            closed_at=closed_at,
            sla_response_breached=False,
            sla_resolution_breached=breached,
            created_at=created_dt,
            updated_at=resolved_at or first_resp_at or created_dt,
        )
        db.add(t)
        db.flush()
        created_tickets.append(t)

        # History: Created
        db.add(
            TicketHistory(
                ticket_id=t.id,
                actor_id=requester.id,
                action="CREATED",
                field_name="status",
                old_value=None,
                new_value="open",
                description=f"Ticket {t.ticket_number} submitted by {requester.full_name} ({prio.upper()}).",
                created_at=created_dt,
            )
        )

        if assignee:
            assign_time = created_dt + timedelta(minutes=10)
            db.add(
                TicketHistory(
                    ticket_id=t.id,
                    actor_id=admin_user.id,
                    action="ASSIGNED",
                    field_name="assigned_agent",
                    old_value="Unassigned",
                    new_value=assignee.full_name,
                    description=f"Assigned to {assignee.full_name} ({team_map[team_code].name}).",
                    created_at=assign_time,
                )
            )
            db.add(
                TicketComment(
                    ticket_id=t.id,
                    author_id=assignee.id,
                    body=f"Hi {requester.full_name.split()[0]}, I have taken ownership of {t.ticket_number} and am investigating the issue on `{service}`.",
                    is_internal=False,
                    created_at=assign_time + timedelta(minutes=5),
                    updated_at=assign_time + timedelta(minutes=5),
                )
            )
            db.add(
                TicketComment(
                    ticket_id=t.id,
                    author_id=assignee.id,
                    body=f"Internal triage diagnostic: Verified telemetry logs for `{service}`. Escalation path aligned with {team_map[team_code].code} runbook.",
                    is_internal=True,
                    created_at=assign_time + timedelta(minutes=12),
                    updated_at=assign_time + timedelta(minutes=12),
                )
            )

        if resolved_at and assignee:
            db.add(
                TicketHistory(
                    ticket_id=t.id,
                    actor_id=assignee.id,
                    action="STATUS_CHANGED",
                    field_name="status",
                    old_value="in_progress",
                    new_value="resolved",
                    description=f"Ticket resolved by {assignee.full_name}. Root cause mitigated and verified with requester.",
                    created_at=resolved_at,
                )
            )
            db.add(
                TicketComment(
                    ticket_id=t.id,
                    author_id=assignee.id,
                    body="Issue has been resolved and validated. Please let us know if you experience any further degradation, otherwise this ticket will close automatically.",
                    is_internal=False,
                    created_at=resolved_at,
                    updated_at=resolved_at,
                )
            )

    # Create a real physical sample attachment on local disk for TKT-2026-0018 & TKT-2026-0001
    upload_root = Path(settings.LOCAL_UPLOAD_DIR).resolve()
    for target_t, fname, content_text in [
        (
            created_tickets[0],
            "vpn_tls_diagnostic_log.txt",
            "2026-11-01T10:14:22Z [ERROR] PanGP HipCheck: Gateway us-west-gw.corp.ticketdesk.enterprise TLS handshake timeout after 10000ms.\nCipherSuite: TLS_AES_256_GCM_SHA384\nClientOS: macOS 15.1 (Arm64)\n",
        ),
        (
            created_tickets[17],
            "bgp_direct_connect_trace.txt",
            "2026-11-16T06:12:01Z %BGP-5-ADJCHANGE: neighbor 169.254.44.1 Down BGP Notification sent\nASN: 64512 -> AWS Direct Connect VIF-019283\nPacket Loss: 0.4% on primary circuit.\n",
        ),
    ]:
        t_dir = upload_root / target_t.ticket_number
        t_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"seed_{target_t.ticket_number.lower()}_{fname}"
        fpath = t_dir / stored_name
        raw_bytes = content_text.encode("utf-8")
        fpath.write_bytes(raw_bytes)

        db.add(
            TicketAttachment(
                ticket_id=target_t.id,
                uploaded_by_id=target_t.requester_id,
                original_filename=fname,
                stored_filename=stored_name,
                storage_provider="local",
                storage_key=f"{target_t.ticket_number}/{stored_name}",
                content_type="text/plain",
                file_size=len(raw_bytes),
                created_at=target_t.created_at + timedelta(minutes=2),
            )
        )

    # 8. Knowledge Base Articles (Section 13 requirements)
    kb_articles = [
        (
            "Resetting Your Corporate Active Directory & Okta SSO Password",
            "resetting-corporate-password-okta-sso",
            "Step-by-step instructions to self-service reset your corporate Okta Single Sign-On password and unlock your Active Directory account.",
            """## Overview
All TicketDesk Enterprise employees authenticate using **Okta Single Sign-On (SSO)** synchronized with Corporate Active Directory. Password policies require rotation every 90 days.

### Password Complexity Requirements
- Minimum length of **14 characters**
- At least one uppercase letter, one lowercase letter, one number, and one special symbol
- Cannot reuse any of your previous 12 passwords
- Cannot contain your username or first/last name

### Step-by-Step Self-Service Reset
1. Navigate to the corporate SSO portal at `https://sso.ticketdesk.enterprise`.
2. Click **Need help signing in?** -> **Forgot password?**
3. Enter your `@ticketdesk.enterprise` email address and select **Reset via Okta Verify Push** or **SMS/Voice MFA**.
4. Approve the push notification on your registered mobile device.
5. Enter and confirm your new password.
6. **Important for MacBook & Windows Laptop Users**: After changing your password online, lock and unlock your workstation while connected to Corporate VPN or Office Wi-Fi so your local FileVault / BitLocker keychain synchronizes.""",
            "access",
            "password,okta,sso,mfa,lockout",
            342,
            89,
        ),
        (
            "Connecting to Corporate Office Wi-Fi (TicketDesk-Corp 802.1X)",
            "connecting-to-office-wifi-8021x",
            "How to configure WPA3-Enterprise 802.1X wireless authentication on macOS, Windows 11, iOS, and Android devices across all global offices.",
            """## Corporate Wireless Networks
Our global offices broadcast two SSIDs:
- **`TicketDesk-Corp`**: Encrypted WPA3-Enterprise (802.1X) network with direct access to internal engineering, finance, and staging resources.
- **`TicketDesk-Guest`**: Isolated internet-only network for visitors and personal mobile devices (requires daily sponsor code).

### Automatic MDM Configuration (Corporate Laptops)
Corporate-managed MacBooks (Jamf Pro) and Windows ThinkPads (Microsoft Intune) automatically install the 802.1X machine certificate. If prompted:
1. Select **`TicketDesk-Corp`** from your Wi-Fi menu.
2. Enter your Okta username (without `@ticketdesk.enterprise`) and current SSO password.
3. When prompted to verify the RADIUS certificate (`radius.corp.ticketdesk.enterprise`), click **Trust / Connect**.

### Troubleshooting Wi-Fi Drops
- Forget the `TicketDesk-Guest` network so your laptop does not roam onto the guest VLAN during video calls.
- Ensure your MAC address randomization ("Private Wi-Fi Address") is **disabled** for `TicketDesk-Corp`.""",
            "network",
            "wifi,wireless,802.1x,meraki,network",
            275,
            64,
        ),
        (
            "Troubleshooting GlobalProtect VPN Access & Split-Tunnel Routing",
            "troubleshooting-vpn-access-globalprotect",
            "Resolve TLS handshake timeouts, MFA prompts, and internal DNS resolution issues on Palo Alto GlobalProtect VPN.",
            """## When Is VPN Required?
GlobalProtect VPN is required when accessing internal `.corp.ticketdesk.enterprise` systems, staging databases, or private AWS VPC endpoints from outside corporate offices.

### Common Issue 1: "Connecting..." Stuck or TLS Handshake Timeout
1. Open the GlobalProtect system tray / menu bar icon -> **Settings (Gear Icon)** -> **General**.
2. Click **Sign Out** and clear saved credentials.
3. Verify your portal address is set to **`vpn.ticketdesk.enterprise`**.
4. If you are on a home router using IPv6 or custom DNS (like `1.1.1.1`), flush your local DNS cache:
   - **macOS**: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
   - **Windows**: `ipconfig /flushdns`

### Common Issue 2: Internal Hostnames Not Resolving
If connected to VPN but `jira.internal.ticketdesk.enterprise` fails to load, switch your gateway from **Automatic** to **US-West (San Francisco)** or **US-East (New York)** and click **Refresh Connection**.""",
            "network",
            "vpn,globalprotect,dns,remote-access",
            418,
            112,
        ),
        (
            "Installing Approved Enterprise Software via Self-Service Catalog",
            "installing-approved-enterprise-software",
            "How to install pre-approved developer tools, productivity apps, and request paid licenses without local administrator prompts.",
            """## Standard Pre-Approved Software
Employees can install vetted software packages directly without submitting an IT ticket using our endpoint self-service portals:
- **macOS Users**: Open **TicketDesk Self Service** (powered by Jamf) from your Applications folder.
- **Windows 11 Users**: Open **Company Portal** (powered by Microsoft Intune) from the Start Menu.

### Available for Instant 1-Click Install
- Google Chrome, Mozilla Firefox, Brave Browser
- Slack Desktop, Zoom Workplace, Microsoft Teams
- Visual Studio Code, Docker Desktop, Postman, Git, Python 3.12+, Node.js LTS
- Notion, Figma Desktop, 1Password Enterprise

### Requesting Licensed Commercial Software
For seats requiring procurement approval (JetBrains All Products Pack, Adobe Acrobat Pro, Tableau Desktop, Lucidchart):
1. Submit a ticket under **Category: Software -> License Provisioning**.
2. Include your **Department Cost Center** and manager approval if the annual seat exceeds $250.""",
            "software",
            "software,jamf,intune,licenses,install",
            198,
            51,
        ),
        (
            "Enrolling Hardware Security Keys (YubiKey) and Okta Verify MFA",
            "enrolling-yubikey-okta-verify-mfa",
            "Protect your corporate identity with phishing-resistant FIDO2/WebAuthn YubiKeys and Okta FastPass.",
            """## Mandatory Multi-Factor Authentication
TicketDesk Enterprise enforces phishing-resistant **FIDO2 / WebAuthn** authentication for all production infrastructure and financial systems.

### Registering a Backup Factor
We strongly recommend registering at least **two** independent MFA factors (e.g., Okta Verify on mobile + YubiKey 5C Nano) so you are never locked out when upgrading phones:
1. Sign in to `https://sso.ticketdesk.enterprise` -> **Settings** -> **Security Methods**.
2. Click **Set up** next to **Security Key or Biometric Authenticator**.
3. Insert your YubiKey and tap the gold contact disc when it flashes.""",
            "security",
            "mfa,yubikey,security,fido2,okta",
            164,
            47,
        ),
        (
            "Requesting Temporary Production Database & AWS IAM Access (JIT)",
            "requesting-aws-iam-database-access",
            "Procedure for requesting Just-In-Time (JIT) read/write access to AWS accounts and RDS PostgreSQL instances for incident response.",
            """## Principle of Least Privilege
Direct access to production RDS databases and AWS IAM roles is restricted by default and audited for SOC 2 Type II compliance.

### How to Submit an Access Request
1. Create a ticket under **Category: Access -> GitHub / AWS IAM Role**.
2. Specify:
   - Target AWS Account (`td-staging-02` or `td-prod-01`)
   - Required Permission Level (`ReadOnly`, `DataAnalyst`, or `BreakGlassAdmin`)
   - Duration required (default JIT window is **4 hours**)
   - Business justification or incident ticket number.""",
            "access",
            "aws,iam,rds,database,soc2,access",
            229,
            73,
        ),
    ]

    for title, slug, summary, content, cat_slug, tags, views, helpful in kb_articles:
        db.add(
            KnowledgeArticle(
                title=title,
                slug=slug,
                summary=summary,
                content=content,
                category_id=cat_map[cat_slug].id,
                author_id=admin_user.id,
                tags=tags,
                is_published=True,
                view_count=views,
                helpful_count=helpful,
                created_at=now - timedelta(days=30),
                updated_at=now - timedelta(days=3),
            )
        )

    # 9. Seed Notifications for Demo Accounts
    notifications_seed = [
        (admin_user.id, created_tickets[27].id, "[CRITICAL] New Ticket TKT-2026-0028", "Lucas Moreau reported: Urgent: Executive laptop BitLocker recovery key prompt after BIOS update", "high_priority_alert", False),
        (admin_user.id, created_tickets[17].id, "SLA Breach Warning: TKT-2026-0018", "AWS Direct Connect BGP session flapping has exceeded its 4-hour Critical resolution target.", "sla_breach", False),
        (agents[0].id, created_tickets[26].id, "Ticket Assigned to You: TKT-2026-0027", "Evelyn Sterling assigned 'VPN split-tunnel routing blocking access to internal Jira Data Center' to you.", "ticket_assigned", False),
        (agents[0].id, created_tickets[17].id, "SLA Breach Alert: TKT-2026-0018", "Critical ticket TKT-2026-0018 requires immediate status update.", "sla_breach", False),
        (agents[1].id, created_tickets[19].id, "Ticket Assigned to You: TKT-2026-0020", "Production CI/CD GitHub Actions runner unable to pull from private ECR registry.", "ticket_assigned", False),
        (employees[0].id, created_tickets[26].id, "Agent Assigned: TKT-2026-0027", "Alex Rivera has been assigned to your support ticket regarding VPN split-tunnel routing.", "ticket_assigned", False),
        (employees[0].id, created_tickets[19].id, "Status Update: TKT-2026-0020", "Priya Nair moved your ticket 'Production CI/CD GitHub Actions runner' to In Progress.", "status_changed", False),
    ]
    for uid, tid, title, msg, ntype, is_read in notifications_seed:
        db.add(
            Notification(
                user_id=uid,
                ticket_id=tid,
                title=title,
                message=msg,
                notification_type=ntype,
                is_read=is_read,
                created_at=now - timedelta(minutes=35),
            )
        )

    # 10. System Settings
    settings_seed = [
        ("organization_name", "TicketDesk Enterprise Corp", "general", "Primary organization display name across the portal and notifications."),
        ("support_portal_email", "it-helpdesk@ticketdesk.enterprise", "general", "Default reply-to address for IT Service Desk notifications."),
        ("business_hours_window", "Mon-Fri 08:00 - 18:00 UTC", "sla", "Standard operating window for business-hours SLA policies."),
        ("allow_employee_reopen_days", "7", "tickets", "Number of days after resolution within which an employee may reopen a ticket."),
        ("auto_close_resolved_days", "5", "tickets", "Automatically transition Resolved tickets to Closed after N days of inactivity."),
        ("storage_provider_mode", settings.STORAGE_PROVIDER, "storage", "Active attachment storage backend (local or Amazon S3)."),
        ("s3_bucket_name", settings.S3_BUCKET_NAME, "storage", "Configured Amazon S3 bucket for ticket attachments and Lambda event processing."),
    ]
    for key, val, cat, desc in settings_seed:
        db.add(
            SystemSetting(
                key=key,
                value=val,
                category=cat,
                description=desc,
                updated_by_id=admin_user.id,
                updated_at=now - timedelta(days=10),
            )
        )

    # 11. Seed Audit Logs
    audit_seed = [
        (admin_user.id, "SYSTEM_INITIALIZED", "system", "seed-v1", "10.0.14.10", {"environment": settings.APP_ENV, "tickets_seeded": len(created_tickets)}),
        (admin_user.id, "SLA_POLICY_UPDATED", "sla_policy", "critical", "10.0.14.10", {"response_target_minutes": 15, "resolution_target_minutes": 240}),
        (agents[0].id, "USER_LOGIN", "user", str(agents[0].id), "10.0.22.45", {"email": agents[0].email, "role": "agent"}),
        (employees[0].id, "TICKET_CREATED", "ticket", "TKT-2026-0027", "172.16.8.91", {"priority": "high", "category": "Network"}),
        (admin_user.id, "TICKET_ASSIGNED", "ticket", "TKT-2026-0027", "10.0.14.10", {"new_agent": "Alex Rivera"}),
    ]
    for uid, act, etype, eid, ip, meta in audit_seed:
        db.add(
            AuditLog(
                user_id=uid,
                action=act,
                entity_type=etype,
                entity_id=eid,
                ip_address=ip,
                user_agent="Mozilla/5.0 (Enterprise Workstation)",
                metadata_json=json.dumps(meta),
                created_at=now - timedelta(hours=2),
            )
        )

    db.commit()
    logger.info("Successfully seeded TicketDesk Enterprise database!")
