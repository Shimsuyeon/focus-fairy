export const installPageStyles = `
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			min-height: 100vh;
			background: linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 50%, #0d1f0d 100%);
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			font-family: 'Segoe UI', system-ui, sans-serif;
			color: rgba(255, 255, 255, 0.85);
			padding: 2rem 1rem;
		}

		.container {
			max-width: 520px;
			width: 100%;
		}

		.header {
			text-align: center;
			margin-bottom: 2rem;
		}
		.header-emoji { margin-bottom: 0.5rem; }
		.header-emoji img { width: 80px; height: 80px; }
		.header h1 { font-size: 1.8rem; margin-bottom: 0.3rem; }
		.header p { color: rgba(255, 255, 255, 0.5); font-size: 0.9rem; }

		.step {
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid rgba(167, 139, 250, 0.15);
			border-radius: 14px;
			padding: 1.5rem;
			margin-bottom: 1rem;
		}
		.step.hidden { display: none; }
		.step.reveal { animation: fadeSlideIn 0.3s ease forwards; }

		@keyframes fadeSlideIn {
			from { opacity: 0; transform: translateY(8px); }
			to { opacity: 1; transform: translateY(0); }
		}

		.step-header {
			display: flex;
			align-items: center;
			gap: 0.7rem;
			margin-bottom: 1rem;
		}
		.step-number {
			background: #a78bfa;
			color: white;
			width: 28px;
			height: 28px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 0.85rem;
			font-weight: 700;
			flex-shrink: 0;
		}
		.step-title {
			font-size: 1rem;
			font-weight: 600;
		}
		.step-optional {
			font-size: 0.75rem;
			color: rgba(167, 139, 250, 0.7);
			background: rgba(167, 139, 250, 0.1);
			padding: 2px 8px;
			border-radius: 4px;
			margin-left: auto;
		}

		.step-body {
			color: rgba(255, 255, 255, 0.6);
			font-size: 0.85rem;
			line-height: 1.6;
		}

		.comparison {
			display: flex;
			gap: 0.75rem;
			margin: 1rem 0;
		}
		.comparison-item {
			flex: 1;
			text-align: center;
		}
		.comparison-label {
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.4);
			margin-bottom: 0.4rem;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		.comparison-img {
			width: 100%;
			height: 60px;
			object-fit: contain;
			border-radius: 8px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			background: rgba(255, 255, 255, 0.95);
		}

		.choice-buttons {
			display: flex;
			gap: 0.5rem;
			margin-top: 1rem;
		}
		.choice-btn {
			flex: 1;
			padding: 10px;
			border-radius: 8px;
			border: none;
			font-size: 0.85rem;
			font-weight: 600;
			font-family: inherit;
			cursor: pointer;
			transition: all 0.3s ease;
		}
		.choice-btn.yes {
			background: rgba(167, 139, 250, 0.2);
			color: #a78bfa;
			border: 1px solid rgba(167, 139, 250, 0.3);
		}
		.choice-btn.yes:hover { background: rgba(167, 139, 250, 0.35); }
		.choice-btn.no {
			background: rgba(255, 255, 255, 0.05);
			color: rgba(255, 255, 255, 0.5);
			border: 1px solid rgba(255, 255, 255, 0.1);
		}
		.choice-btn.no:hover {
			background: rgba(255, 255, 255, 0.1);
			color: rgba(255, 255, 255, 0.7);
		}

		.sub-step {
			margin-top: 1rem;
			padding-top: 1rem;
			border-top: 1px solid rgba(255, 255, 255, 0.06);
		}
		.sub-step.hidden { display: none; }
		.sub-step.reveal { animation: fadeSlideIn 0.3s ease forwards; }

		.sub-step-label {
			font-size: 0.75rem;
			color: #a78bfa;
			font-weight: 600;
			margin-bottom: 0.5rem;
		}
		.action-btn {
			display: block;
			width: 100%;
			padding: 10px 16px;
			border-radius: 8px;
			text-decoration: none;
			font-size: 0.85rem;
			font-weight: 600;
			text-align: center;
			cursor: pointer;
			transition: all 0.3s ease;
			border: 1px solid rgba(167, 139, 250, 0.3);
			font-family: inherit;
			background: rgba(167, 139, 250, 0.2);
			color: #a78bfa;
		}
		.action-btn:hover { background: rgba(167, 139, 250, 0.35); }
		.action-btn.confirm {
			margin-top: 0.5rem;
			background: transparent;
			border: 1px dashed rgba(167, 139, 250, 0.4);
			color: rgba(167, 139, 250, 0.7);
		}
		.action-btn.confirm:hover {
			background: rgba(167, 139, 250, 0.15);
			color: #a78bfa;
		}

		.workspace-input {
			width: 100%;
			padding: 10px 12px;
			border-radius: 8px;
			border: 1px solid rgba(167, 139, 250, 0.3);
			background: rgba(255, 255, 255, 0.08);
			color: rgba(255, 255, 255, 0.9);
			font-size: 0.85rem;
			font-family: inherit;
			outline: none;
			transition: border-color 0.3s ease;
			margin-bottom: 0.5rem;
		}
		.workspace-input::placeholder { color: rgba(255, 255, 255, 0.25); }
		.workspace-input:focus { border-color: #a78bfa; }
		.workspace-input.error { border-color: #F87171; }
		.workspace-error {
			font-size: 0.75rem;
			color: #F87171;
			margin-top: -0.3rem;
			margin-bottom: 0.4rem;
			display: none;
		}
		.workspace-hint {
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.35);
			margin-top: 0.5rem;
		}

		.btn {
			display: block;
			background: #a78bfa;
			color: white;
			padding: 14px 32px;
			border-radius: 10px;
			text-decoration: none;
			font-size: 1.1rem;
			font-weight: 600;
			text-align: center;
			transition: all 0.3s ease;
		}
		.btn:hover {
			background: #8b6ff0;
			transform: translateY(-2px);
			box-shadow: 0 4px 20px rgba(167, 139, 250, 0.4);
		}

		.scopes {
			margin-top: 0.5rem;
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.3);
			text-align: center;
		}

		code {
			background: rgba(255, 255, 255, 0.1);
			padding: 2px 6px;
			border-radius: 4px;
			font-size: 0.85em;
			color: #a78bfa;
		}

		.footer {
			text-align: center;
			margin-top: 1.5rem;
			color: rgba(255, 255, 255, 0.3);
			font-size: 0.75rem;
		}
		.footer a {
			color: rgba(255, 255, 255, 0.3);
			text-decoration: none;
		}
		.footer a:hover { color: #a78bfa; }
`;

export function resultPageStyles(color: string): string {
	return `
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			min-height: 100vh;
			background: linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 50%, #0d1f0d 100%);
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			font-family: 'Segoe UI', system-ui, sans-serif;
			color: rgba(255, 255, 255, 0.85);
			padding: 2rem 1rem;
			gap: 1.5rem;
		}
		.card {
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid ${color}44;
			border-radius: 16px;
			padding: 2.5rem;
			max-width: 460px;
			text-align: center;
		}
		.emoji { font-size: 3rem; margin-bottom: 1rem; }
		h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: ${color}; white-space: pre-line; }
		.retry { color: rgba(255, 255, 255, 0.6); line-height: 1.6; }

		.next-steps {
			text-align: center;
			margin-top: 0.5rem;
		}
		.next-alert {
			font-size: 0.9rem;
			color: #FBBF24;
			font-weight: 600;
			margin-bottom: 0.7rem;
		}
		.next-desc {
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.5);
			margin-bottom: 0.7rem;
		}
		.copy-block {
			display: flex;
			align-items: center;
			justify-content: space-between;
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(167, 139, 250, 0.3);
			border-radius: 8px;
			padding: 12px 16px;
			cursor: pointer;
			transition: all 0.2s ease;
		}
		.copy-block:hover {
			background: rgba(167, 139, 250, 0.1);
		}
		.copy-text {
			font-family: 'SF Mono', 'Consolas', monospace;
			font-size: 0.95rem;
			color: #a78bfa;
			font-weight: 600;
		}
		.copy-btn {
			font-size: 0.75rem;
			color: rgba(255, 255, 255, 0.4);
			transition: color 0.2s ease;
		}

		.command-card {
			text-align: left;
		}
		.command-card h2 {
			font-size: 1rem;
			color: rgba(255, 255, 255, 0.7);
			margin-bottom: 1rem;
			text-align: center;
		}
		.command-card table {
			width: 100%;
			border-collapse: collapse;
		}
		.command-card td {
			padding: 6px 8px;
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.6);
			border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		}
		.command-card td.cmd {
			font-family: 'SF Mono', 'Consolas', monospace;
			color: #a78bfa;
			font-weight: 600;
			white-space: nowrap;
			width: 90px;
		}
	`;
}
